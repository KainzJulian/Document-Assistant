"""Hybrid retrieval over the selected documents.

Vector search (top 30) and keyword search (top 30) are fused with reciprocal rank fusion (k = 60);
the best 8 passages within 6,000 tokens are kept, and the next chunk of the same section is
appended when it fits so passages are not cut mid-thought.
"""

import re
import uuid
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models import Chunk, Document, EmbeddingModel, User
from app.repositories.documents import visible_query
from app.services.extractors import STOPWORDS
from app.services.indexing import active_model, embed_texts

TOP_K = 30
KEEP = 8
TOKEN_BUDGET = 6000
RRF_K = 60


@dataclass
class Passage:
    """A passage handed to the answer prompt.

    Attributes:
        chunk_id: Id of the main chunk.
        document_id: Id of its document.
        document_title: Title of the document.
        section_path: Section of the passage.
        page_from: First page.
        page_to: Last page (extended when a neighbour chunk was appended).
        text: Passage text.
        score: Fused ranking score.
        vector_rank: Rank in the vector search (1-based) or None.
        keyword_rank: Rank in the keyword search (1-based) or None.
    """

    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    section_path: str | None
    page_from: int | None
    page_to: int | None
    text: str
    score: float
    vector_rank: int | None
    keyword_rank: int | None


def _tokens(text_value: str) -> int:
    """Estimate the token count of a text (one token per 3.5 characters)."""
    return max(1, round(len(text_value) / 3.5))


def _vector_search(db: Session, model: EmbeddingModel, query: list[float], ids: list[uuid.UUID]) -> list[uuid.UUID]:
    """Return the chunk ids closest to the query vector (cosine distance)."""
    dims = int(model.dims)
    db.execute(text("SET LOCAL hnsw.ef_search = 100"))
    rows = db.execute(
        text(
            f"SELECT e.chunk_id FROM chunk_embeddings e JOIN chunks c ON c.id = e.chunk_id "
            f"WHERE e.model_id = :mid AND c.document_id = ANY(:ids) "
            f"ORDER BY (e.embedding::vector({dims})) <=> CAST(:q AS vector({dims})) LIMIT {TOP_K}"
        ),
        {"mid": model.id, "ids": ids, "q": str(query)},
    ).all()
    return [r[0] for r in rows]


def _keyword_search(db: Session, question: str, ids: list[uuid.UUID]) -> list[uuid.UUID]:
    """Return the chunk ids with the best full-text rank (any question word may match)."""
    words: list[str] = []
    for word in re.findall(r"\w{2,}", question.lower()):
        if word not in STOPWORDS["de"] and word not in STOPWORDS["en"] and word not in words:
            words.append(word)
    if not words:
        return []
    rows = db.execute(
        text(
            "SELECT c.id FROM chunks c, to_tsquery('simple', immutable_unaccent(:q)) query "
            "WHERE c.document_id = ANY(:ids) AND c.tsv @@ query "
            f"ORDER BY ts_rank_cd(c.tsv, query) DESC LIMIT {TOP_K}"
        ),
        {"q": " | ".join(words[:12]), "ids": ids},
    ).all()
    return [r[0] for r in rows]


def fuse(vector: list[uuid.UUID], keyword: list[uuid.UUID]) -> list[tuple[uuid.UUID, float]]:
    """Combine two rankings with reciprocal rank fusion.

    Args:
        vector: Chunk ids ranked by vector similarity.
        keyword: Chunk ids ranked by keyword relevance.

    Returns:
        Chunk ids with their fused score, best first.
    """
    scores: dict[uuid.UUID, float] = {}
    for ranking in (vector, keyword):
        for rank, chunk_id in enumerate(ranking, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank)
    return sorted(scores.items(), key=lambda item: item[1], reverse=True)


def _assemble(
    db: Session, fused: list[tuple[uuid.UUID, float]], vector: list[uuid.UUID], keyword: list[uuid.UUID]
) -> list[Passage]:
    """Load the best chunks, keep the token budget and append neighbour chunks that fit."""
    top = fused[:KEEP]
    if not top:
        return []
    rows = db.execute(
        select(Chunk, Document.title).join(Document, Document.id == Chunk.document_id).where(Chunk.id.in_([i for i, _ in top]))
    ).all()
    by_id = {chunk.id: (chunk, title) for chunk, title in rows}
    passages: list[Passage] = []
    used = 0
    for chunk_id, score in top:
        if chunk_id not in by_id:
            continue
        chunk, title = by_id[chunk_id]
        cost = _tokens(chunk.text)
        if passages and used + cost > TOKEN_BUDGET:
            break
        used += cost
        passages.append(
            Passage(
                chunk.id,
                chunk.document_id,
                title,
                chunk.section_path,
                chunk.page_from,
                chunk.page_to,
                chunk.text,
                score,
                vector.index(chunk_id) + 1 if chunk_id in vector else None,
                keyword.index(chunk_id) + 1 if chunk_id in keyword else None,
            )
        )
    taken = {p.chunk_id for p in passages}
    for passage in passages:
        origin = by_id[passage.chunk_id][0]
        neighbour = db.scalar(
            select(Chunk).where(
                Chunk.document_id == origin.document_id,
                Chunk.ordinal == origin.ordinal + 1,
                Chunk.section_path == origin.section_path if origin.section_path else Chunk.section_path.is_(None),
            )
        )
        if neighbour is None or neighbour.id in taken:
            continue
        cost = _tokens(neighbour.text)
        if used + cost > TOKEN_BUDGET:
            continue
        used += cost
        passage.text = f"{passage.text}\n\n{neighbour.text}"
        passage.page_to = neighbour.page_to or passage.page_to
    return passages


async def retrieve(db: Session, user: User, question: str, document_ids: list[uuid.UUID]) -> list[Passage]:
    """Find the passages that answer a question, only inside documents the person may see.

    Args:
        db: Database session.
        user: The asking person.
        question: The (stand-alone) question.
        document_ids: The documents selected for the chat.

    Returns:
        Up to 8 passages, best first; empty if nothing matches or no document is usable.
    """
    allowed = [
        d.id
        for d, _ in db.execute(visible_query(user).where(Document.id.in_(document_ids), Document.status == "ready")).all()
    ]
    if not allowed:
        return []
    model = active_model(db)
    vector: list[uuid.UUID] = []
    if model is not None:
        query = (await embed_texts(db, model, [question]))[0]
        vector = _vector_search(db, model, query, allowed)
    keyword = _keyword_search(db, question, allowed)
    return _assemble(db, fuse(vector, keyword), vector, keyword)
