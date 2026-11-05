"""Chats: create, list, open, rename, delete, send a question (streamed answer), regenerate, passages."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import Chat, ChatDocument, Chunk, Document, Message, Provider, User, UserSettings
from app.deps import CurrentUser, DbSession
from app.errors import ApiError
from app.models.chats import (
    ChatCreate,
    ChatDetail,
    ChatDocumentOut,
    ChatPatch,
    ChatSummary,
    ChunkOut,
    CitationOut,
    MessageOut,
    SendMessage,
)
from app.providers.registry import build_provider
from app.repositories.documents import visible_query
from app.services.answering import AnswerContext, count_answers, history_messages, stream_answer
from app.services.chatsearch import search_chats

router = APIRouter(prefix="/chats", tags=["chats"])
chunk_router = APIRouter(tags=["chats"])

_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _chat(db: Session, user: User, chat_id: uuid.UUID) -> Chat:
    """Load a chat the person owns (chats are always private)."""
    chat = db.get(Chat, chat_id)
    if chat is None or chat.owner_id != user.id:
        raise ApiError(404, "chat_not_found", "Chat nicht gefunden.")
    return chat


def _ready_ids(db: Session, user: User, ids: list[uuid.UUID]) -> list[uuid.UUID]:
    """Return the ids that are visible to the person and ready; raise if none are usable."""
    usable = [d.id for d, _ in db.execute(visible_query(user).where(Document.id.in_(ids), Document.status == "ready")).all()]
    if not usable:
        raise ApiError(422, "no_documents", "Wähle mindestens ein Dokument, das bereit ist.")
    return usable


def _detail(db: Session, chat: Chat) -> ChatDetail:
    """Build the chat with documents and messages."""
    docs = db.execute(
        select(Document.id, Document.title, Document.status)
        .join(ChatDocument, ChatDocument.document_id == Document.id)
        .where(ChatDocument.chat_id == chat.id)
    ).all()
    messages = db.scalars(select(Message).where(Message.chat_id == chat.id).order_by(Message.created_at)).all()
    return ChatDetail(
        id=chat.id,
        title=chat.title,
        provider=chat.provider,
        model=chat.model,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        documents=[ChatDocumentOut(id=d[0], title=d[1], status=d[2]) for d in docs],
        messages=[
            MessageOut(
                id=m.id,
                role=m.role,
                content=m.content,
                citations=[CitationOut(**c) for c in m.citations],
                provider=m.provider,
                model=m.model,
                interrupted=m.role == "assistant" and m.tokens_out is None,
                created_at=m.created_at,
            )
            for m in messages
        ],
    )


@router.post("", status_code=201)
def create_chat(body: ChatCreate, user: CurrentUser, db: DbSession) -> ChatDetail:
    """Start a chat about the selected documents (only documents that are ready).

    Args:
        body: Ids of the selected documents.
        user: The logged-in person.
        db: Database session.

    Returns:
        The new chat.
    """
    ids = _ready_ids(db, user, body.document_ids)
    chat = Chat(owner_id=user.id)
    db.add(chat)
    db.flush()
    db.add_all(ChatDocument(chat_id=chat.id, document_id=i) for i in ids)
    db.flush()
    db.refresh(chat)
    return _detail(db, chat)


@router.get("")
def list_chats(user: CurrentUser, db: DbSession, q: str = "") -> list[ChatSummary]:
    """List the person's chats, newest first, or search them by words in titles and messages.

    Args:
        user: The logged-in person.
        db: Database session.
        q: Search text (typo tolerant); empty lists all chats.

    Returns:
        The chats.
    """
    return search_chats(db, user, q)


@router.get("/{chat_id}")
def get_chat(chat_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ChatDetail:
    """Open a chat with its messages.

    Args:
        chat_id: Id of the chat.
        user: The logged-in person.
        db: Database session.

    Returns:
        The chat.
    """
    return _detail(db, _chat(db, user, chat_id))


@router.patch("/{chat_id}")
def patch_chat(chat_id: uuid.UUID, body: ChatPatch, user: CurrentUser, db: DbSession) -> ChatDetail:
    """Rename a chat or change its selected documents.

    Args:
        chat_id: Id of the chat.
        body: Fields to change.
        user: The logged-in person.
        db: Database session.

    Returns:
        The updated chat.
    """
    chat = _chat(db, user, chat_id)
    if body.title is not None:
        chat.title = body.title.strip()
    if body.document_ids is not None:
        ids = _ready_ids(db, user, body.document_ids)
        db.execute(delete(ChatDocument).where(ChatDocument.chat_id == chat.id))
        db.flush()
        db.add_all(ChatDocument(chat_id=chat.id, document_id=i) for i in ids)
    db.flush()
    return _detail(db, chat)


@router.delete("/{chat_id}", status_code=204)
def delete_chat(chat_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    """Delete a chat with all its messages.

    Args:
        chat_id: Id of the chat.
        user: The logged-in person.
        db: Database session.
    """
    db.delete(_chat(db, user, chat_id))


def _prepare(db: Session, user: User, chat_id: uuid.UUID, content: str | None, regenerate_id: uuid.UUID | None) -> AnswerContext:
    """Validate everything the stream needs, save the question and an empty answer, and commit.

    Doing this before the stream starts means problems (no model chosen, no documents) are normal
    HTTP errors instead of events.
    """
    chat = _chat(db, user, chat_id)
    settings = db.get(UserSettings, user.id)
    if settings is None or settings.provider_id is None or not settings.model:
        raise ApiError(422, "no_model", "Wähle zuerst in den Einstellungen ein Modell.")
    row = db.get(Provider, settings.provider_id)
    if row is None or not row.enabled:
        raise ApiError(422, "provider_unavailable", "Der gewählte Anbieter ist nicht verfügbar. Wähle in den Einstellungen ein anderes Modell.")
    provider = build_provider(row)
    doc_ids = list(db.scalars(select(ChatDocument.document_id).where(ChatDocument.chat_id == chat.id)).all())
    if not doc_ids:
        raise ApiError(422, "no_documents", "Wähle mindestens ein Dokument.")
    now = datetime.now(UTC)
    if regenerate_id is not None:
        last = db.scalars(select(Message).where(Message.chat_id == chat.id).order_by(Message.created_at.desc()).limit(2)).all()
        if len(last) < 2 or last[0].id != regenerate_id or last[0].role != "assistant" or last[1].role != "user":
            raise ApiError(409, "not_last_answer", "Nur die letzte Antwort kann neu erstellt werden.")
        question = last[1].content
        history = history_messages(db, chat.id, before=last[1].created_at)
        db.delete(last[0])
        db.flush()
    else:
        assert content is not None
        question = content
        history = history_messages(db, chat.id)
        db.add(Message(chat_id=chat.id, role="user", content=content, created_at=now))
    first = count_answers(db, chat.id) == 0 and not chat.title
    answer = Message(
        chat_id=chat.id, role="assistant", content="", provider=row.kind, model=settings.model, created_at=now + timedelta(milliseconds=5)
    )
    db.add(answer)
    chat.updated_at = now
    db.commit()
    return AnswerContext(chat.id, user.id, answer.id, question, history, doc_ids, provider, row.kind, settings.model, first)


def _stream(ctx: AnswerContext) -> StreamingResponse:
    """Wrap the answer stream in a response."""
    return StreamingResponse(stream_answer(ctx), media_type="text/event-stream", headers=_HEADERS)


@router.post("/{chat_id}/messages")
async def send_message(chat_id: uuid.UUID, body: SendMessage, user: CurrentUser, db: DbSession) -> StreamingResponse:
    """Ask a question; the answer streams back as Server-Sent Events.

    Events: ``token``, ``citations``, ``done``, ``title``, ``error``. The question and the answer are
    saved as they happen.

    Args:
        chat_id: Id of the chat.
        body: The question.
        user: The logged-in person.
        db: Database session.

    Returns:
        An event stream.
    """
    content = body.content.strip()
    if not content:
        raise ApiError(422, "empty_question", "Bitte gib eine Frage ein.")
    ctx = await run_in_threadpool(_prepare, db, user, chat_id, content, None)
    return _stream(ctx)


@router.post("/{chat_id}/messages/{message_id}/regenerate")
async def regenerate(chat_id: uuid.UUID, message_id: uuid.UUID, user: CurrentUser, db: DbSession) -> StreamingResponse:
    """Create the last answer again with the same question.

    Args:
        chat_id: Id of the chat.
        message_id: Id of the last assistant message.
        user: The logged-in person.
        db: Database session.

    Returns:
        An event stream.
    """
    ctx = await run_in_threadpool(_prepare, db, user, chat_id, None, message_id)
    return _stream(ctx)


@chunk_router.get("/chunks/{chunk_id}")
def get_chunk(chunk_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ChunkOut:
    """Return a passage for the citation panel (only if the person may see its document).

    Args:
        chunk_id: Id of the chunk.
        user: The logged-in person.
        db: Database session.

    Returns:
        The passage with its document title and pages.

    Raises:
        ApiError: 404 if the chunk or its document is gone or not visible.
    """
    row = db.execute(
        visible_query(user).add_columns(Chunk).join(Chunk, Chunk.document_id == Document.id).where(Chunk.id == chunk_id)
    ).first()
    if row is None:
        raise ApiError(404, "chunk_not_found", "Dokument gelöscht")
    doc, _, chunk = row
    return ChunkOut(
        id=chunk.id,
        document_id=doc.id,
        document_title=doc.title,
        page_from=chunk.page_from,
        page_to=chunk.page_to,
        section_path=chunk.section_path,
        text=chunk.text,
    )
