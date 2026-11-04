"""Document queries that always respect ownership and sharing.

A person sees their own documents plus documents others marked ``shared``; shared documents
are read-only for everyone but the owner.
"""

import uuid
from typing import Literal

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from app.db.models import Document, User
from app.errors import ApiError
from app.services.filetypes import KINDS

Scope = Literal["all", "mine", "shared"]


def _not_found() -> ApiError:
    """Return the error for a missing or invisible document."""
    return ApiError(404, "document_not_found", "Dokument nicht gefunden.")


def visible_query(user: User) -> Select[Document, str]:
    """Build the base query for documents a person may see, with the owner's display name.

    Args:
        user: The viewing person.

    Returns:
        A select of ``(Document, owner display name)``.
    """
    return (
        select(Document, User.display_name)
        .join(User, User.id == Document.owner_id)
        .where(or_(Document.owner_id == user.id, Document.shared.is_(True)))
    )


def list_visible(
    db: Session, user: User, q: str = "", status: str = "", scope: Scope = "all", kind: str = ""
) -> list[tuple[Document, str]]:
    """List visible documents, newest first.

    Args:
        db: Database session.
        user: The viewing person.
        q: Title search (case-insensitive substring).
        status: Only this status, if given.
        scope: ``mine``, ``shared`` (others' shared documents) or ``all``.
        kind: Only this document type (``pdf``, ``docx``, ``url`` ...).

    Returns:
        Pairs of document and owner display name.
    """
    query = visible_query(user).order_by(Document.created_at.desc())
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.where(Document.title.ilike(f"%{escaped}%", escape="\\"))
    if status:
        query = query.where(Document.status == status)
    if kind in ("url", "text"):
        query = query.where(Document.source_type == kind)
    elif kind in KINDS:
        query = query.where(Document.source_type == "file", Document.mime == KINDS[kind].mime)
    if scope == "mine":
        query = query.where(Document.owner_id == user.id)
    elif scope == "shared":
        query = query.where(Document.owner_id != user.id)
    return [(row[0], row[1]) for row in db.execute(query).all()]


def get_visible(db: Session, user: User, document_id: uuid.UUID) -> tuple[Document, str]:
    """Return a document the person may see.

    Raises:
        ApiError: 404 if it does not exist or is private to someone else.
    """
    row = db.execute(visible_query(user).where(Document.id == document_id)).first()
    if row is None:
        raise _not_found()
    return row[0], row[1]


def get_owned(db: Session, user: User, document_id: uuid.UUID) -> Document:
    """Return a document the person owns.

    Raises:
        ApiError: 404 if invisible, 403 if visible but owned by someone else.
    """
    doc, _ = get_visible(db, user, document_id)
    if doc.owner_id != user.id:
        raise ApiError(403, "forbidden", "Dieses Dokument gehört dir nicht.")
    return doc


def find_by_hash(db: Session, user: User, content_hash: str) -> Document | None:
    """Find a duplicate in the person's own library by content hash."""
    return db.scalar(
        select(Document).where(Document.owner_id == user.id, Document.content_hash == content_hash)
    )
