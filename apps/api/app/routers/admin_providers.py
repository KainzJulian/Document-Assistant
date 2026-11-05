"""Provider management (admin only). API keys are write-only: stored encrypted, never returned."""

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.db.models import Provider
from app.deps import DbSession, require_admin
from app.errors import ApiError
from app.models.ai import ProviderCreate, ProviderOut, ProviderPatch, ProviderTestOut
from app.providers.base import ProviderError
from app.providers.registry import build_provider
from app.services.secrets import encrypt

router = APIRouter(prefix="/admin/providers", tags=["admin"], dependencies=[Depends(require_admin)])


def _out(p: Provider) -> ProviderOut:
    """Build the API model; ``has_key`` replaces the key."""
    return ProviderOut(
        id=p.id,
        kind=p.kind,
        label=p.label,
        base_url=p.base_url,
        enabled=p.enabled,
        has_key=bool(p.api_key_enc),
        models=list(p.models),
    )


def _get(db: DbSession, provider_id: int) -> Provider:
    """Load a provider or raise 404."""
    provider = db.get(Provider, provider_id)
    if provider is None:
        raise ApiError(404, "provider_not_found", "Anbieter nicht gefunden.")
    return provider


@router.get("")
def list_providers(db: DbSession) -> list[ProviderOut]:
    """List all providers.

    Args:
        db: Database session.

    Returns:
        The providers, without keys.
    """
    return [_out(p) for p in db.scalars(select(Provider).order_by(Provider.id)).all()]


@router.post("", status_code=201)
def create_provider(body: ProviderCreate, db: DbSession) -> ProviderOut:
    """Add a provider.

    Args:
        body: Kind, label, optional address and key.
        db: Database session.

    Returns:
        The new provider.

    Raises:
        ApiError: 422 if a cloud provider has no key.
    """
    if body.kind != "ollama" and not body.api_key:
        raise ApiError(422, "no_api_key", "Für diesen Anbieter braucht es einen API-Schlüssel.")
    provider = Provider(
        kind=body.kind,
        label=body.label.strip(),
        base_url=(body.base_url or "").strip() or None,
        api_key_enc=encrypt(body.api_key) if body.api_key else None,
        models=[],
    )
    db.add(provider)
    db.flush()
    return _out(provider)


@router.patch("/{provider_id}")
def patch_provider(provider_id: int, body: ProviderPatch, db: DbSession) -> ProviderOut:
    """Change a provider; an empty key keeps the stored one.

    Args:
        provider_id: Id of the provider.
        body: Fields to change.
        db: Database session.

    Returns:
        The updated provider.
    """
    provider = _get(db, provider_id)
    if body.label is not None:
        provider.label = body.label.strip()
    if body.base_url is not None:
        provider.base_url = body.base_url.strip() or None
    if body.api_key:
        provider.api_key_enc = encrypt(body.api_key)
    if body.enabled is not None:
        provider.enabled = body.enabled
    db.flush()
    return _out(provider)


@router.delete("/{provider_id}", status_code=204)
def delete_provider(provider_id: int, db: DbSession) -> None:
    """Remove a provider; people who used it must choose a model again.

    Args:
        provider_id: Id of the provider.
        db: Database session.
    """
    db.delete(_get(db, provider_id))


@router.post("/{provider_id}/test")
async def test_provider(provider_id: int, db: DbSession) -> ProviderTestOut:
    """Check the connection and refresh the cached model list ("Verbindung testen").

    Args:
        provider_id: Id of the provider.
        db: Database session.

    Returns:
        ``ok`` with the models, or the German reason it failed.
    """
    provider = _get(db, provider_id)
    try:
        models = await build_provider(provider).list_models()
    except ProviderError as error:
        return ProviderTestOut(ok=False, message=error.message, models=[])
    provider.models = models
    db.flush()
    return ProviderTestOut(ok=True, message=f"Verbindung steht. {len(models)} Modelle gefunden.", models=models)
