"""Per-person settings: model choice, summary language, Ollama warning acknowledgements."""

from fastapi import APIRouter
from sqlalchemy import select

from app.db.models import OllamaAcknowledgement, Provider, UserSettings
from app.deps import CurrentUser, DbSession
from app.errors import ApiError
from app.models.ai import AckIn, ProviderChoice, SettingsIn, SettingsOut
from app.providers.base import is_embedding_model

router = APIRouter(tags=["settings"])


def _choices(db: DbSession) -> list[ProviderChoice]:
    """List the enabled providers with their chat models (embedding models are left out)."""
    providers = db.scalars(select(Provider).where(Provider.enabled.is_(True)).order_by(Provider.id)).all()
    return [
        ProviderChoice(
            id=p.id,
            kind=p.kind,
            label=p.label,
            local=p.kind == "ollama",
            models=[m for m in p.models if not is_embedding_model(m)],
        )
        for p in providers
    ]


@router.get("/settings")
def get_settings_route(user: CurrentUser, db: DbSession) -> SettingsOut:
    """Return the person's settings and the providers and models they can choose from.

    Args:
        user: The logged-in person.
        db: Database session.

    Returns:
        Settings and choices.
    """
    row = db.get(UserSettings, user.id)
    return SettingsOut(
        provider_id=row.provider_id if row else None,
        model=row.model if row else None,
        summary_language=row.summary_language if row else "source",
        providers=_choices(db),
    )


@router.put("/settings")
def put_settings(body: SettingsIn, user: CurrentUser, db: DbSession) -> SettingsOut:
    """Save the person's provider, model and summary language.

    Args:
        body: The new settings.
        user: The logged-in person.
        db: Database session.

    Returns:
        The saved settings with the available choices.

    Raises:
        ApiError: 422 if the provider is unknown or disabled, or the model is not offered by it.
    """
    if body.provider_id is not None:
        provider = db.get(Provider, body.provider_id)
        if provider is None or not provider.enabled:
            raise ApiError(422, "provider_unavailable", "Dieser Anbieter ist nicht verfügbar.")
        if body.model is None or (provider.models and body.model not in provider.models):
            raise ApiError(422, "model_unavailable", "Dieses Modell wird vom Anbieter nicht angeboten.")
    row = db.get(UserSettings, user.id)
    if row is None:
        row = UserSettings(user_id=user.id)
        db.add(row)
    row.provider_id = body.provider_id
    row.model = body.model if body.provider_id is not None else None
    row.summary_language = body.summary_language
    db.flush()
    return get_settings_route(user, db)


@router.get("/providers/{provider_id}/models")
def provider_models(provider_id: int, _: CurrentUser, db: DbSession) -> list[str]:
    """Return the cached chat models of an enabled provider.

    Args:
        provider_id: Id of the provider.
        _: The logged-in person (any role).
        db: Database session.

    Returns:
        Model ids.
    """
    provider = db.get(Provider, provider_id)
    if provider is None or not provider.enabled:
        raise ApiError(404, "provider_not_found", "Anbieter nicht gefunden.")
    return [m for m in provider.models if not is_embedding_model(m)]


@router.post("/settings/ollama-ack", status_code=204)
def ollama_ack(body: AckIn, user: CurrentUser, db: DbSession) -> None:
    """Remember that the person accepted the hardware warning for a model ("Trotzdem verwenden").

    Args:
        body: The model and the verdict that was accepted.
        user: The logged-in person.
        db: Database session.
    """
    row = db.get(OllamaAcknowledgement, (user.id, body.model))
    if row is None:
        db.add(OllamaAcknowledgement(user_id=user.id, model=body.model, verdict=body.verdict))
    else:
        row.verdict = body.verdict
