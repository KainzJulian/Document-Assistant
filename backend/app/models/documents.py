"""Pydantic models for documents."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import Document
from app.services.filetypes import kind_for_mime


class DocumentOut(BaseModel):
    """A document as shown in the library."""

    id: uuid.UUID
    title: str
    kind: str
    filename: str | None
    size_bytes: int | None
    url: str | None
    language: str | None
    page_count: int | None
    word_count: int | None
    status: str
    error: str | None
    shared: bool
    mine: bool
    owner_name: str
    created_at: datetime
    updated_at: datetime


def to_out(doc: Document, owner_name: str, viewer_id: uuid.UUID) -> DocumentOut:
    """Build the API model of a document for one viewer.

    Args:
        doc: The document.
        owner_name: Display name of the owner.
        viewer_id: Id of the person looking at it.

    Returns:
        The API model.
    """
    return DocumentOut(
        id=doc.id,
        title=doc.title,
        kind=kind_for_mime(doc.mime, doc.source_type),
        filename=doc.filename,
        size_bytes=doc.size_bytes,
        url=doc.url,
        language=doc.language,
        page_count=doc.page_count,
        word_count=doc.word_count,
        status=doc.status,
        error=doc.error,
        shared=doc.shared,
        mine=doc.owner_id == viewer_id,
        owner_name=owner_name,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


class UploadResult(BaseModel):
    """Outcome for one uploaded file."""

    filename: str
    outcome: Literal["created", "duplicate", "rejected"]
    message: str | None = None
    document: DocumentOut | None = None


class DocumentPatch(BaseModel):
    """Body of ``PATCH /documents/{id}``; only given fields change."""

    model_config = ConfigDict(strict=True, extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=300)
    shared: bool | None = None


class DocumentTextOut(BaseModel):
    """Extracted text of a document."""

    markdown: str
    extractor: str


class UrlImport(BaseModel):
    """Body of ``POST /documents/url``."""

    model_config = ConfigDict(strict=True, extra="forbid")

    url: str = Field(min_length=1, max_length=2000)


class TextImport(BaseModel):
    """Body of ``POST /documents/text``."""

    model_config = ConfigDict(strict=True, extra="forbid")

    title: str = Field(min_length=1, max_length=300)
    text: str = Field(min_length=1, max_length=2_000_000)
