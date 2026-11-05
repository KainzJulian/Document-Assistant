"""SQLAlchemy models for every table in PLAN.md section 6.

NOTE: ``tsv`` columns use ``immutable_unaccent`` (created in the baseline migration)
because Postgres only allows IMMUTABLE functions in generated columns and the stock
``unaccent`` is STABLE.
"""

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector  # pyright: ignore[reportMissingTypeStubs]
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Computed,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT, JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

_NOW = func.now()
_UUID_DEFAULT = func.gen_random_uuid()


def _tsv(column: str) -> Computed:
    """Build the generated full-text expression (``simple`` config, accent-insensitive)."""
    return Computed(f"to_tsvector('simple', immutable_unaccent({column}))", persisted=True)


class Base(DeclarativeBase):
    """Declarative base for all models."""


class User(Base):
    """Household account. Created by the admin; there is no sign-up."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'member')", name="users_role_ck"),
        {"comment": "Household accounts (admin and members)."},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=_UUID_DEFAULT)
    username: Mapped[str] = mapped_column(
        CITEXT, unique=True, comment="Login name, case-insensitive."
    )
    display_name: Mapped[str] = mapped_column(Text)
    password_hash: Mapped[str] = mapped_column(Text, comment="argon2id hash.")
    role: Mapped[str] = mapped_column(Text, comment="admin or member.")
    disabled: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    failed_logins: Mapped[int] = mapped_column(
        Integer, server_default=text("0"), comment="Failed logins in the current window."
    )
    failed_window_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), comment="Start of the 15 minute failed-login window."
    )
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), comment="Login refused until this time (5 failures per 15 min)."
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=_NOW)


class UserSession(Base):
    """Server-side login session. The id is the SHA-256 hash of the cookie token."""

    __tablename__ = "sessions"
    __table_args__ = {"comment": "Login sessions; HttpOnly cookie, 30 days sliding."}

    id: Mapped[str] = mapped_column(Text, primary_key=True, comment="SHA-256 hex of the token.")
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=_NOW)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=_NOW)


class Document(Base):
    """A file, imported URL or pasted text in a person's library."""

    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("owner_id", "content_hash", name="documents_owner_hash_uq"),
        UniqueConstraint("owner_id", "url_normalized", name="documents_owner_url_uq"),
        CheckConstraint("source_type IN ('file', 'url', 'text')", name="documents_source_ck"),
        CheckConstraint(
            "status IN ('queued', 'reading', 'indexing', 'ready', 'failed')",
            name="documents_status_ck",
        ),
        Index("documents_owner_created_ix", "owner_id", "created_at"),
        Index("documents_shared_ix", "shared", postgresql_where=text("shared")),
        Index("documents_title_trgm", "title", postgresql_using="gin", postgresql_ops={"title": "gin_trgm_ops"}),
        {"comment": "Library documents; owner_id scopes every query."},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=_UUID_DEFAULT)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(Text, comment="file, url or text.")
    filename: Mapped[str | None] = mapped_column(Text)
    mime: Mapped[str | None] = mapped_column(Text)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    url: Mapped[str | None] = mapped_column(Text)
    url_normalized: Mapped[str | None] = mapped_column(
        Text, comment="Without tracking params and fragment."
    )
    content_hash: Mapped[str | None] = mapped_column(Text, comment="SHA-256 of the original bytes.")
    language: Mapped[str | None] = mapped_column(Text)
    page_count: Mapped[int | None] = mapped_column(Integer)
    word_count: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(
        Text, server_default=text("'queued'"), comment="queued, reading, indexing, ready or failed."
    )
    error: Mapped[str | None] = mapped_column(Text, comment="German failure reason.")
    shared: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=_NOW)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=_NOW)


class DocumentText(Base):
    """Extracted Markdown, kept apart so library lists stay light."""

    __tablename__ = "document_texts"
    __table_args__ = {"comment": "Extracted Markdown with page or section markers."}

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    markdown: Mapped[str] = mapped_column(Text)
    extractor: Mapped[str] = mapped_column(Text)
    extracted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=_NOW)


class Chunk(Base):
    """A passage of a document used for retrieval."""

    __tablename__ = "chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "ordinal", name="chunks_document_ordinal_uq"),
        Index("chunks_tsv_gin", "tsv", postgresql_using="gin"),
        {"comment": "Document passages (about 400 words) with section path and page range."},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=_UUID_DEFAULT)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    ordinal: Mapped[int] = mapped_column(Integer)
    section_path: Mapped[str | None] = mapped_column(Text, comment="e.g. Kapitel 2 > Methoden.")
    page_from: Mapped[int | None] = mapped_column(Integer)
    page_to: Mapped[int | None] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    word_count: Mapped[int] = mapped_column(Integer)
    tsv: Mapped[str] = mapped_column(TSVECTOR, _tsv("text"), deferred=True)


class EmbeddingModel(Base):
    """An embedding model; exactly one is active at a time."""

    __tablename__ = "embedding_models"
    __table_args__ = (
        CheckConstraint(
            "status IN ('building', 'active', 'retired')", name="embedding_models_status_ck"
        ),
        Index(
            "embedding_models_one_active",
            "status",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        {"comment": "Embedding models; a switch builds the new one while the old keeps serving."},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    dims: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text, comment="building, active or retired.")
    progress: Mapped[float] = mapped_column(Float, server_default=text("0"), comment="0 to 1.")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=_NOW)
    retired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), comment="When the model stopped being active."
    )


class ChunkEmbedding(Base):
    """Vector of one chunk for one embedding model."""

    __tablename__ = "chunk_embeddings"
    __table_args__ = (
        Index("chunk_embeddings_model_ix", "model_id"),
        {"comment": "Chunk vectors; one HNSW cosine index per model is created by the re-index job."},
    )

    chunk_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chunks.id", ondelete="CASCADE"), primary_key=True
    )
    model_id: Mapped[int] = mapped_column(
        ForeignKey("embedding_models.id", ondelete="CASCADE"), primary_key=True
    )
    embedding: Mapped[list[float]] = mapped_column(Vector())


class Summary(Base):
    """Saved summary of a document in one of five lengths."""

    __tablename__ = "summaries"
    __table_args__ = (
        UniqueConstraint("document_id", "length", name="summaries_document_length_uq"),
        CheckConstraint("length IN ('xs', 's', 'm', 'l', 'xl')", name="summaries_length_ck"),
        {"comment": "One summary per document and length, with the model that wrote it."},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=_UUID_DEFAULT)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    length: Mapped[str] = mapped_column(Text, comment="xs, s, m, l or xl.")
    text: Mapped[str] = mapped_column(Text)
    word_count: Mapped[int] = mapped_column(Integer)
    target_words: Mapped[int] = mapped_column(Integer)
    provider: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=_NOW)


class Provider(Base):
    """AI provider configured by the admin."""

    __tablename__ = "providers"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('anthropic', 'openai', 'google', 'ollama')", name="providers_kind_ck"
        ),
        {"comment": "Admin-managed AI providers; keys are Fernet-encrypted and write-only."},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(Text)
    label: Mapped[str] = mapped_column(Text)
    base_url: Mapped[str | None] = mapped_column(Text)
    api_key_enc: Mapped[str | None] = mapped_column(
        Text, comment="Fernet token; never returned by the API."
    )
    enabled: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    models: Mapped[list[str]] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb"), comment="Cached model list."
    )


class Chat(Base):
    """A private conversation about selected documents."""

    __tablename__ = "chats"
    __table_args__ = (
        Index("chats_owner_updated_ix", "owner_id", "updated_at"),
        {"comment": "Chats are always private to their owner."},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=_UUID_DEFAULT)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=_NOW)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=_NOW)


class ChatDocument(Base):
    """Document selected as a source of a chat."""

    __tablename__ = "chat_documents"
    __table_args__ = {"comment": "Selected sources of a chat; can change during the chat."}

    chat_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chats.id", ondelete="CASCADE"), primary_key=True
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )


class Message(Base):
    """One chat message with its citations."""

    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="messages_role_ck"),
        Index("messages_tsv_gin", "tsv", postgresql_using="gin"),
        Index(
            "messages_content_trgm",
            "content",
            postgresql_using="gin",
            postgresql_ops={"content": "gin_trgm_ops"},
        ),
        Index("messages_chat_created_ix", "chat_id", "created_at"),
        {"comment": "Chat messages; tsv and trigram indexes power typo-tolerant search."},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=_UUID_DEFAULT)
    chat_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chats.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(Text, comment="user or assistant.")
    content: Mapped[str] = mapped_column(Text)
    citations: Mapped[list[dict[str, object]]] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb"), comment="Number to chunk, document and page."
    )
    provider: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text)
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=_NOW)
    tsv: Mapped[str] = mapped_column(TSVECTOR, _tsv("content"), deferred=True)


class UserSettings(Base):
    """Per-person model choice and summary language."""

    __tablename__ = "user_settings"
    __table_args__ = (
        CheckConstraint("summary_language IN ('source', 'de')", name="user_settings_lang_ck"),
        {"comment": "Each person's provider, model and summary language."},
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    provider_id: Mapped[int | None] = mapped_column(ForeignKey("providers.id", ondelete="SET NULL"))
    model: Mapped[str | None] = mapped_column(Text)
    summary_language: Mapped[str] = mapped_column(Text, server_default=text("'source'"))


class OllamaAcknowledgement(Base):
    """Warning the person accepted with 'Trotzdem verwenden'."""

    __tablename__ = "ollama_acknowledgements"
    __table_args__ = {
        "comment": "Lets the hardware dialog re-appear only when the verdict gets worse."
    }

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    model: Mapped[str] = mapped_column(Text, primary_key=True)
    verdict: Mapped[str] = mapped_column(Text)
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=_NOW)
