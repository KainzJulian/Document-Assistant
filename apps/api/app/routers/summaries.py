"""Summaries of a document: list the saved ones, create one (streamed)."""

import uuid

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Provider, Summary, User, UserSettings
from app.deps import CurrentUser, DbSession
from app.errors import ApiError
from app.models.summaries import SummaryOut, SummaryRequest
from app.providers.registry import build_provider
from app.repositories.documents import get_visible
from app.services.summarising import SummaryContext, stream_summary, to_out

router = APIRouter(prefix="/documents", tags=["summaries"])


@router.get("/{document_id}/summaries")
def list_summaries(document_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[SummaryOut]:
    """List the saved summaries of a visible document (everyone who sees it sees its summaries).

    Args:
        document_id: Id of the document.
        user: The logged-in person.
        db: Database session.

    Returns:
        The summaries, one per length at most.
    """
    doc, _ = get_visible(db, user, document_id)
    rows = db.scalars(select(Summary).where(Summary.document_id == doc.id)).all()
    order = {"xs": 0, "s": 1, "m": 2, "l": 3, "xl": 4}
    return [to_out(r, doc.word_count or 0) for r in sorted(rows, key=lambda r: order[r.length])]


def _prepare(db: Session, user: User, document_id: uuid.UUID, body: SummaryRequest) -> SummaryContext:
    """Validate the request and build the context before the stream starts."""
    doc, _ = get_visible(db, user, document_id)
    if doc.status != "ready":
        raise ApiError(409, "not_ready", "Das Dokument ist noch nicht bereit.")
    settings = db.get(UserSettings, user.id)
    if settings is None or settings.provider_id is None or not settings.model:
        raise ApiError(422, "no_model", "Wähle zuerst in den Einstellungen ein Modell.")
    row = db.get(Provider, settings.provider_id)
    if row is None or not row.enabled:
        raise ApiError(422, "provider_unavailable", "Der gewählte Anbieter ist nicht verfügbar.")
    return SummaryContext(
        document_id=doc.id,
        user_id=user.id,
        length=body.length,
        language=body.language,
        provider=build_provider(row),
        provider_kind=row.kind,
        model=settings.model,
    )


@router.post("/{document_id}/summaries")
async def create_summary(document_id: uuid.UUID, body: SummaryRequest, user: CurrentUser, db: DbSession) -> StreamingResponse:
    """Create (or replace) the summary of a document in one length; the text streams back.

    Events: ``progress`` ("Teil 3 von 7"), ``reset``, ``token``, ``done`` (with the saved summary),
    ``error``.

    Args:
        document_id: Id of the document.
        body: Length and language.
        user: The logged-in person.
        db: Database session.

    Returns:
        An event stream.
    """
    ctx = await run_in_threadpool(_prepare, db, user, document_id, body)
    return StreamingResponse(
        stream_summary(ctx), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

