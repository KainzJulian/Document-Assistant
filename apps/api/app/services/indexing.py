"""Chunking and embeddings: the "Wird indexiert" step, the embedding model switch and the purge."""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, exists, func, insert, select, text
from sqlalchemy.orm import Session

from app.db.models import Chunk, ChunkEmbedding, Document, DocumentText, EmbeddingModel, Provider
from app.db.session import get_engine
from app.providers.base import ProviderError
from app.providers.registry import build_provider
from app.services.chunking import chunk_markdown
from app.services.ingestion import set_status

log = logging.getLogger(__name__)
BATCH = 32


def active_model(db: Session) -> EmbeddingModel | None:
    """Return the active embedding model, if one is set up."""
    return db.scalar(select(EmbeddingModel).where(EmbeddingModel.status == "active"))


async def embed_texts(db: Session, model: EmbeddingModel, texts: list[str]) -> list[list[float]]:
    """Embed texts with a model's provider, in batches of 32.

    Args:
        db: Database session.
        model: The embedding model to use.
        texts: The texts.

    Returns:
        One vector per text, in order.

    Raises:
        ProviderError: If no enabled provider of that kind exists or the call fails.
    """
    row = db.scalar(
        select(Provider).where(Provider.kind == model.provider, Provider.enabled.is_(True)).order_by(Provider.id)
    )
    if row is None:
        raise ProviderError("Für das Embedding-Modell ist kein aktiver Anbieter eingerichtet.")
    provider = build_provider(row)
    vectors: list[list[float]] = []
    for start in range(0, len(texts), BATCH):
        vectors += await provider.embed(model.model, texts[start : start + BATCH])
    return vectors


async def embed_and_store(db: Session, model: EmbeddingModel, rows: list[tuple[uuid.UUID, str]]) -> None:
    """Embed chunks and save their vectors for one model.

    Args:
        db: Database session (not committed here).
        model: The embedding model.
        rows: Pairs of chunk id and chunk text.
    """
    if not rows:
        return
    vectors = await embed_texts(db, model, [t for _, t in rows])
    db.execute(
        insert(ChunkEmbedding),
        [{"chunk_id": cid, "model_id": model.id, "embedding": vec} for (cid, _), vec in zip(rows, vectors, strict=True)],
    )


async def index_document(document_id: uuid.UUID) -> None:
    """Chunk a document's text, embed the chunks with the active model and set it to ``ready``.

    Without an active embedding model the document becomes ``ready`` with keyword search only.

    Args:
        document_id: Id of the document (status ``indexing``).
    """
    with Session(get_engine()) as db:
        doc = db.get(Document, document_id)
        source = db.get(DocumentText, document_id)
        if doc is None:
            return
        try:
            if source is None:
                raise ProviderError("Der Text fehlt.")
            db.execute(delete(Chunk).where(Chunk.document_id == doc.id))
            rows = [
                Chunk(
                    document_id=doc.id,
                    ordinal=c.ordinal,
                    section_path=c.section_path,
                    page_from=c.page_from,
                    page_to=c.page_to,
                    text=c.text,
                    word_count=c.word_count,
                )
                for c in chunk_markdown(source.markdown)
            ]
            db.add_all(rows)
            db.flush()
            model = active_model(db)
            if model is not None:
                await embed_and_store(db, model, [(c.id, c.text) for c in rows])
            db.commit()
            set_status(db, doc, "ready")
        except ProviderError as error:
            db.rollback()
            set_status(db, doc, "failed", f"Das Indexieren ist fehlgeschlagen: {error.message}")
        except Exception:
            log.exception("Indexing of %s failed", document_id)
            db.rollback()
            set_status(db, doc, "failed", "Das Dokument konnte nicht indexiert werden.")


def create_hnsw_index(db: Session, model: EmbeddingModel) -> None:
    """Create the cosine HNSW index for one model (a partial index on a fixed-size cast).

    NOTE: pgvector indexes at most 2,000 dimensions with ``vector``; bigger models fall back to
    exact search (slower, still correct) and a warning is logged.
    """
    try:
        db.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS chunk_emb_hnsw_{int(model.id)} ON chunk_embeddings "
                f"USING hnsw ((embedding::vector({int(model.dims)})) vector_cosine_ops) "
                f"WHERE model_id = {int(model.id)}"
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        log.warning("No HNSW index for embedding model %s (%s dims)", model.id, model.dims)


async def reindex(model_id: int) -> None:
    """Build vectors for every chunk with a new model while the old model keeps serving, then switch.

    Learns the vector size, creates the index, embeds all chunks, catches up chunks added meanwhile,
    switches atomically and catches up once more. A failure retires the new model (progress below 1).

    Args:
        model_id: Id of the model in status ``building``.
    """
    with Session(get_engine()) as db:
        model = db.get(EmbeddingModel, model_id)
        if model is None:
            return
        try:
            model.dims = len((await embed_texts(db, model, ["Dimensionstest"]))[0])
            db.commit()
            create_hnsw_index(db, model)
            total = db.scalar(select(func.count()).select_from(Chunk)) or 0
            done = 0

            async def catch_up() -> int:
                nonlocal done
                count = 0
                while True:
                    missing = db.execute(
                        select(Chunk.id, Chunk.text)
                        .where(
                            ~exists().where(ChunkEmbedding.chunk_id == Chunk.id, ChunkEmbedding.model_id == model_id)
                        )
                        .limit(BATCH * 4)
                    ).all()
                    if not missing:
                        return count
                    await embed_and_store(db, model, [(r[0], r[1]) for r in missing])
                    done += len(missing)
                    count += len(missing)
                    model.progress = min(0.99, done / total) if total else 0.99
                    db.commit()

            await catch_up()
            old = active_model(db)
            if old is not None:
                old.status = "retired"
                old.retired_at = datetime.now(UTC)
                db.flush()
            model.status = "active"
            model.progress = 1.0
            db.commit()
            await catch_up()
        except Exception as error:
            log.exception("Re-index of model %s failed", model_id)
            db.rollback()
            failed = db.get(EmbeddingModel, model_id)
            if failed is not None and failed.status == "building":
                failed.status = "retired"
                failed.retired_at = datetime.now(UTC)
                db.commit()
            if not isinstance(error, ProviderError):
                raise


def purge_retired(days: int = 7) -> int:
    """Delete vectors and indexes of models retired more than ``days`` days ago.

    Args:
        days: Grace period in days.

    Returns:
        The number of models purged.
    """
    with Session(get_engine()) as db:
        cutoff = datetime.now(UTC) - timedelta(days=days)
        ids = db.scalars(
            select(EmbeddingModel.id).where(EmbeddingModel.status == "retired", EmbeddingModel.retired_at < cutoff)
        ).all()
        for model_id in ids:
            db.execute(delete(ChunkEmbedding).where(ChunkEmbedding.model_id == model_id))
            db.execute(text(f"DROP INDEX IF EXISTS chunk_emb_hnsw_{int(model_id)}"))
        db.commit()
        return len(ids)
