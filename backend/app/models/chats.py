"""Pydantic models for chats and messages."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

# NOTE: JSON carries ids as strings, so ids in request bodies are not strict (the rest of the body is).
DocumentId = Annotated[uuid.UUID, Field(strict=False)]


class CitationOut(BaseModel):
    """A numbered source of an answer ([1], [2] ...)."""

    n: int
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    page_from: int | None
    page_to: int | None
    section_path: str | None


class MessageOut(BaseModel):
    """One message of a chat. ``interrupted`` marks an answer that did not finish ("abgebrochen")."""

    id: uuid.UUID
    role: str
    content: str
    citations: list[CitationOut]
    provider: str | None
    model: str | None
    interrupted: bool
    created_at: datetime


class ChatDocumentOut(BaseModel):
    """A document selected for a chat."""

    id: uuid.UUID
    title: str
    status: str


class ChatSummary(BaseModel):
    """A chat in the sidebar list."""

    id: uuid.UUID
    title: str | None
    created_at: datetime
    updated_at: datetime
    snippet: str | None = None
    message_id: uuid.UUID | None = None


class ChatDetail(BaseModel):
    """A chat with its documents and messages."""

    id: uuid.UUID
    title: str | None
    provider: str | None
    model: str | None
    created_at: datetime
    updated_at: datetime
    documents: list[ChatDocumentOut]
    messages: list[MessageOut]


class ChatCreate(BaseModel):
    """Body of ``POST /chats``."""

    model_config = ConfigDict(strict=True, extra="forbid")

    document_ids: list[DocumentId] = Field(min_length=1, max_length=50)


class ChatPatch(BaseModel):
    """Body of ``PATCH /chats/{id}``."""

    model_config = ConfigDict(strict=True, extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    document_ids: list[DocumentId] | None = Field(default=None, min_length=1, max_length=50)


class SendMessage(BaseModel):
    """Body of ``POST /chats/{id}/messages``."""

    model_config = ConfigDict(strict=True, extra="forbid")

    content: str = Field(min_length=1, max_length=8000)


class ChunkOut(BaseModel):
    """A passage for the citation panel."""

    id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    page_from: int | None
    page_to: int | None
    section_path: str | None
    text: str
