"""Library endpoints: upload, list, detail, text, file, rename and share, delete, retry, events."""

import asyncio
import hashlib
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Document, DocumentText, User
from app.db.session import get_engine
from app.deps import CurrentUser, DbSession
from app.errors import ApiError
from app.jobs.extract import extract_document
from app.models.documents import (
    DocumentOut,
    DocumentPatch,
    DocumentTextOut,
    TextImport,
    UploadResult,
    UrlImport,
    to_out,
)
from app.repositories import documents as repo
from app.repositories.documents import Scope
from app.services.extractors import ExtractionError, extract_html_string, word_count
from app.services.filetypes import KINDS, MAX_UPLOAD_BYTES, detect_kind
from app.services.storage import delete_document_files, document_dir, safe_filename, save_file
from app.services.urlimport import MIN_WORDS, fetch_html, normalize_url

router = APIRouter(prefix="/documents", tags=["documents"])

_UNSUPPORTED = (
    "Dieser Dateityp wird nicht unterstützt. "
    "Erlaubt sind PDF, TXT, Markdown, DOCX, PPTX, HTML und EPUB."
)


def _store(db: Session, user: User, filename: str, data: bytes, kind: str) -> UploadResult:
    """Save one valid upload (or report the duplicate) and commit before the job is queued."""
    content_hash = hashlib.sha256(data).hexdigest()
    existing = repo.find_by_hash(db, user, content_hash)
    if existing is not None:
        return UploadResult(
            filename=filename,
            outcome="duplicate",
            message="Bereits in deiner Bibliothek",
            document=to_out(existing, user.display_name, user.id),
        )
    document_id = uuid.uuid4()
    stored_name = safe_filename(filename)
    doc = Document(
        id=document_id,
        owner_id=user.id,
        title=Path(stored_name).stem,
        source_type="file",
        filename=stored_name,
        mime=KINDS[kind].mime,
        size_bytes=len(data),
        content_hash=content_hash,
    )
    db.add(doc)
    db.flush()
    save_file(user.id, document_id, stored_name, data)
    db.commit()
    db.refresh(doc)
    return UploadResult(
        filename=filename, outcome="created", document=to_out(doc, user.display_name, user.id)
    )


@router.post("/upload")
async def upload(files: list[UploadFile], user: CurrentUser, db: DbSession) -> list[UploadResult]:
    """Upload one or more files. Each file gets its own result; one bad file does not stop the rest.

    Args:
        files: The files (multipart).
        user: The logged-in person.
        db: Database session.

    Returns:
        One result per file: created, duplicate or rejected with a German reason.
    """
    results: list[UploadResult] = []
    for file in files:
        filename = file.filename or "datei"
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        if not data:
            results.append(
                UploadResult(filename=filename, outcome="rejected", message="Die Datei ist leer.")
            )
        elif len(data) > MAX_UPLOAD_BYTES:
            results.append(
                UploadResult(
                    filename=filename, outcome="rejected", message="Die Datei ist größer als 50 MB."
                )
            )
        elif (kind := detect_kind(data, filename)) is None:
            results.append(
                UploadResult(filename=filename, outcome="rejected", message=_UNSUPPORTED)
            )
        else:
            result = await run_in_threadpool(_store, db, user, filename, data, kind)
            results.append(result)
            if result.outcome == "created" and result.document is not None:
                await extract_document.defer_async(document_id=str(result.document.id))
    return results


def _duplicate(doc: Document, user: User, filename: str) -> UploadResult:
    """Build the "already in your library" result."""
    return UploadResult(
        filename=filename,
        outcome="duplicate",
        message="Bereits in deiner Bibliothek",
        document=to_out(doc, user.display_name, user.id),
    )


def _store_import(
    db: Session,
    user: User,
    *,
    source_type: str,
    title: str,
    data: bytes,
    stored_name: str,
    url: str | None = None,
    content_hash: str | None = None,
) -> Document:
    """Create a document for an imported page or pasted text and commit before queueing."""
    document_id = uuid.uuid4()
    doc = Document(
        id=document_id,
        owner_id=user.id,
        title=title[:300],
        source_type=source_type,
        mime="text/html" if source_type == "url" else "text/plain",
        size_bytes=len(data),
        url=url,
        url_normalized=url,
        content_hash=content_hash,
    )
    db.add(doc)
    db.flush()
    save_file(user.id, document_id, stored_name, data)
    db.commit()
    db.refresh(doc)
    return doc


def _precheck_page(html: str) -> str | None:
    """Extract a fetched page once to see whether it has enough text.

    Args:
        html: The page HTML.

    Returns:
        The page title, if it has one.

    Raises:
        ApiError: 422 ``url_too_short`` if there is too little text.
    """
    try:
        result = extract_html_string(html)
    except ExtractionError:
        result = None
    if result is None or word_count(result.markdown) < MIN_WORDS:
        raise ApiError(
            422,
            "url_too_short",
            "Auf dieser Seite wurde nicht genug Text gefunden. Vielleicht braucht sie JavaScript "
            "oder eine Anmeldung. Du kannst den Text stattdessen einfügen.",
        )
    return result.title


@router.post("/url", status_code=201)
async def import_url(body: UrlImport, user: CurrentUser, db: DbSession) -> UploadResult:
    """Import a web page: its main text becomes a document, the raw HTML is kept.

    Args:
        body: The address.
        user: The logged-in person.
        db: Database session.

    Returns:
        The new document, or the existing one if the page was imported before.

    Raises:
        ApiError: 422 with a ``url_*`` code and a German message if the page cannot be used;
            the frontend then offers to paste the text.
    """
    url = normalize_url(body.url)
    existing = await run_in_threadpool(repo.find_by_url, db, user, url)
    if existing is not None:
        return _duplicate(existing, user, url)
    html = await run_in_threadpool(fetch_html, url)
    title = await run_in_threadpool(_precheck_page, html)
    host = url.split("/")[2]
    doc = await run_in_threadpool(
        lambda: _store_import(
            db,
            user,
            source_type="url",
            title=title or host,
            data=html.encode(),
            stored_name="raw.html",
            url=url,
        )
    )
    await extract_document.defer_async(document_id=str(doc.id))
    return UploadResult(
        filename=url, outcome="created", document=to_out(doc, user.display_name, user.id)
    )


@router.post("/text", status_code=201)
async def import_text(body: TextImport, user: CurrentUser, db: DbSession) -> UploadResult:
    """Store pasted text as a document.

    Args:
        body: Title and text.
        user: The logged-in person.
        db: Database session.

    Returns:
        The new document, or the existing one if the same text was stored before.
    """
    data = body.text.encode()
    content_hash = hashlib.sha256(data).hexdigest()
    existing = await run_in_threadpool(repo.find_by_hash, db, user, content_hash)
    if existing is not None:
        return _duplicate(existing, user, body.title)
    doc = await run_in_threadpool(
        lambda: _store_import(
            db,
            user,
            source_type="text",
            title=body.title.strip(),
            data=data,
            stored_name="text.txt",
            content_hash=content_hash,
        )
    )
    await extract_document.defer_async(document_id=str(doc.id))
    return UploadResult(
        filename=body.title, outcome="created", document=to_out(doc, user.display_name, user.id)
    )


@router.get("")
def list_documents(
    user: CurrentUser,
    db: DbSession,
    q: str = "",
    status: str = "",
    scope: Scope = "all",
    kind: str = "",
) -> list[DocumentOut]:
    """List the documents the person may see, newest first.

    Args:
        user: The logged-in person.
        db: Database session.
        q: Title search.
        status: Only this status.
        scope: ``mine``, ``shared`` (shared with me) or ``all``.
        kind: Only this document type.

    Returns:
        The documents.
    """
    return [
        to_out(d, name, user.id) for d, name in repo.list_visible(db, user, q, status, scope, kind)
    ]


def _changed_since(user_id: uuid.UUID, since: datetime) -> list[DocumentOut]:
    """Return the person's own documents changed at or after ``since``."""
    with Session(get_engine()) as db:
        user = db.get(User, user_id)
        if user is None:
            return []
        rows = db.scalars(
            select(Document).where(Document.owner_id == user_id, Document.updated_at >= since)
        ).all()
        return [to_out(d, user.display_name, user_id) for d in rows]


@router.get("/events")
async def events(request: Request, user: CurrentUser) -> StreamingResponse:
    """Server-Sent Events: a ``document`` event whenever one of the person's documents changes.

    The library loads the list first and then listens here, so changes show without reloading.
    Polls the database once a second (NOTE: switch to LISTEN/NOTIFY if this ever matters).

    Args:
        request: The request, used to notice when the browser disconnects.
        user: The logged-in person.

    Returns:
        An ``text/event-stream`` response.
    """
    user_id = user.id

    async def stream() -> AsyncIterator[str]:
        since = datetime.now(UTC) - timedelta(seconds=5)
        seen: dict[uuid.UUID, datetime] = {}
        idle = 0
        while not await request.is_disconnected():
            sent = False
            for doc in await run_in_threadpool(_changed_since, user_id, since):
                if seen.get(doc.id) != doc.updated_at:
                    seen[doc.id] = doc.updated_at
                    yield f"event: document\ndata: {doc.model_dump_json()}\n\n"
                    sent = True
            idle = 0 if sent else idle + 1
            if idle >= 15:
                idle = 0
                yield ": keepalive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{document_id}")
def get_document(document_id: uuid.UUID, user: CurrentUser, db: DbSession) -> DocumentOut:
    """Return one visible document.

    Args:
        document_id: Id of the document.
        user: The logged-in person.
        db: Database session.

    Returns:
        The document.
    """
    doc, owner_name = repo.get_visible(db, user, document_id)
    return to_out(doc, owner_name, user.id)


@router.get("/{document_id}/text")
def get_text(document_id: uuid.UUID, user: CurrentUser, db: DbSession) -> DocumentTextOut:
    """Return the extracted text (Markdown with page markers).

    Args:
        document_id: Id of the document.
        user: The logged-in person.
        db: Database session.

    Returns:
        The text.

    Raises:
        ApiError: 404 if the document has no text yet.
    """
    doc, _ = repo.get_visible(db, user, document_id)
    text = db.get(DocumentText, doc.id)
    if text is None:
        raise ApiError(404, "text_not_ready", "Der Text ist noch nicht verfügbar.")
    return DocumentTextOut(markdown=text.markdown, extractor=text.extractor)


@router.get("/{document_id}/file")
def get_file(document_id: uuid.UUID, user: CurrentUser, db: DbSession) -> FileResponse:
    """Download the original file.

    Args:
        document_id: Id of the document.
        user: The logged-in person.
        db: Database session.

    Returns:
        The file as an attachment.

    Raises:
        ApiError: 404 if the document has no stored file.
    """
    doc, _ = repo.get_visible(db, user, document_id)
    path = document_dir(doc.owner_id, doc.id) / safe_filename(doc.filename or "")
    if not doc.filename or not path.is_file():
        raise ApiError(404, "file_not_found", "Die Originaldatei ist nicht vorhanden.")
    return FileResponse(
        path, filename=doc.filename, media_type=doc.mime or "application/octet-stream"
    )


@router.patch("/{document_id}")
def patch_document(
    document_id: uuid.UUID, body: DocumentPatch, user: CurrentUser, db: DbSession
) -> DocumentOut:
    """Rename a document or change whether it is shared (owner only).

    Args:
        document_id: Id of the document.
        body: Fields to change.
        user: The logged-in person.
        db: Database session.

    Returns:
        The updated document.
    """
    doc = repo.get_owned(db, user, document_id)
    if body.title is not None:
        doc.title = body.title.strip()
    if body.shared is not None:
        doc.shared = body.shared
    doc.updated_at = datetime.now(UTC)
    db.flush()
    return to_out(doc, user.display_name, user.id)


@router.delete("/{document_id}", status_code=204)
def delete_document(document_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    """Delete a document with its file, text, chunks, vectors and summaries (owner only).

    Args:
        document_id: Id of the document.
        user: The logged-in person.
        db: Database session.
    """
    doc = repo.get_owned(db, user, document_id)
    owner_id = doc.owner_id
    db.delete(doc)
    db.flush()
    delete_document_files(owner_id, document_id)


@router.post("/{document_id}/retry")
async def retry_document(document_id: uuid.UUID, user: CurrentUser, db: DbSession) -> DocumentOut:
    """Process a document again (owner only), for example after a failure.

    Args:
        document_id: Id of the document.
        user: The logged-in person.
        db: Database session.

    Returns:
        The document with status ``queued``.
    """

    def requeue() -> DocumentOut:
        doc = repo.get_owned(db, user, document_id)
        doc.status = "queued"
        doc.error = None
        doc.updated_at = datetime.now(UTC)
        db.commit()
        db.refresh(doc)
        return to_out(doc, user.display_name, user.id)

    out = await run_in_threadpool(requeue)
    await extract_document.defer_async(document_id=str(document_id))
    return out
