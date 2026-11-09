"""Embedding model management and the retrieval debug view (admin only)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.db.models import EmbeddingModel, Provider, User
from app.deps import DbSession, require_admin
from app.errors import ApiError
from app.jobs.reindex import reindex_embedding_model
from app.models.ai import EmbeddingCandidate, EmbeddingModelCreate, EmbeddingModelOut, PassageOut
from app.providers.base import ProviderError, is_embedding_model
from app.services.retrieval import retrieve

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _out(m: EmbeddingModel) -> EmbeddingModelOut:
    """Build the API model of an embedding model."""
    return EmbeddingModelOut(
        id=m.id, provider=m.provider, model=m.model, dims=m.dims, status=m.status, progress=m.progress, created_at=m.created_at
    )


@router.get("/embedding-models")
def list_embedding_models(db: DbSession) -> list[EmbeddingModelOut]:
    """List embedding models, newest first (the active one, the one being built, retired ones).

    Args:
        db: Database session.

    Returns:
        Up to 10 models.
    """
    return [_out(m) for m in db.scalars(select(EmbeddingModel).order_by(EmbeddingModel.id.desc()).limit(10)).all()]


@router.get("/embedding-candidates")
def embedding_candidates(db: DbSession) -> list[EmbeddingCandidate]:
    """List enabled providers with the embedding models they offer (from the cached model lists).

    Args:
        db: Database session.

    Returns:
        Candidates for the embedding model switch; Anthropic has no embeddings.
    """
    rows = db.scalars(
        select(Provider).where(Provider.enabled.is_(True), Provider.kind != "anthropic").order_by(Provider.id)
    ).all()
    return [
        EmbeddingCandidate(
            provider_kind=p.kind, provider_label=p.label, models=[m for m in p.models if is_embedding_model(m)]
        )
        for p in rows
    ]


@router.post("/embedding-models", status_code=201)
async def switch_embedding_model(body: EmbeddingModelCreate, db: DbSession) -> EmbeddingModelOut:
    """Start building a new embedding model in the background; the active one keeps serving.

    Args:
        body: Provider kind and model name.
        db: Database session.

    Returns:
        The new model with status ``building``.

    Raises:
        ApiError: 409 if that model is already active or being built, 422 if no provider is enabled.
    """
    busy = db.scalar(
        select(EmbeddingModel).where(
            EmbeddingModel.provider == body.provider,
            EmbeddingModel.model == body.model,
            EmbeddingModel.status.in_(("active", "building")),
        )
    )
    if busy is not None:
        raise ApiError(409, "embedding_busy", "Dieses Modell ist schon aktiv oder wird gerade aufgebaut.")
    if db.scalar(select(EmbeddingModel).where(EmbeddingModel.status == "building")) is not None:
        raise ApiError(409, "embedding_building", "Es wird gerade ein anderes Modell aufgebaut. Bitte warte, bis es fertig ist.")
    if db.scalar(select(Provider.id).where(Provider.kind == body.provider, Provider.enabled.is_(True))) is None:
        raise ApiError(422, "no_provider", "Für diese Art ist kein aktiver Anbieter eingerichtet.")
    model = EmbeddingModel(provider=body.provider, model=body.model, dims=0, status="building", progress=0.0)
    db.add(model)
    db.commit()
    db.refresh(model)
    await reindex_embedding_model.defer_async(model_id=model.id)
    return _out(model)


@router.get("/retrieval-debug")
async def retrieval_debug(
    q: str, document_ids: Annotated[list[uuid.UUID], Query()], db: DbSession, admin: Annotated[User, Depends(require_admin)]
) -> list[PassageOut]:
    """Show the ranked passages for a question, with vector and keyword ranks.

    Args:
        q: The question.
        document_ids: Documents to search in (repeat the parameter).
        db: Database session.
        admin: The acting admin (sees only documents visible to them).

    Returns:
        The passages exactly as the answer prompt would receive them.
    """
    try:
        passages = await retrieve(db, admin, q, document_ids)
    except ProviderError as error:
        raise ApiError(502, "embedding_failed", error.message) from error
    return [PassageOut(**p.__dict__) for p in passages]
