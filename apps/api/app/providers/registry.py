"""Build the right adapter for a configured provider row."""

from app.config import get_settings
from app.db.models import Provider
from app.errors import ApiError
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.base import LlmProvider
from app.providers.google_provider import GoogleProvider
from app.providers.ollama_provider import OllamaProvider
from app.providers.openai_provider import OpenAIProvider
from app.services.secrets import decrypt


def build_provider(row: Provider) -> LlmProvider:
    """Create the adapter for a provider row (decrypting its key).

    Args:
        row: The configured provider.

    Returns:
        A ready-to-use adapter.

    Raises:
        ApiError: If the provider needs a key and none is stored.
    """
    if row.kind == "ollama":
        return OllamaProvider(row.base_url or get_settings().ollama_url)
    if not row.api_key_enc:
        raise ApiError(422, "no_api_key", "Für diesen Anbieter ist noch kein API-Schlüssel gespeichert.")
    key = decrypt(row.api_key_enc)
    if row.kind == "anthropic":
        return AnthropicProvider(key)
    if row.kind == "openai":
        return OpenAIProvider(key, row.base_url)
    return GoogleProvider(key)
