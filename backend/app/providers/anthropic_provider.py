"""Anthropic (Claude) adapter."""

# pyright: basic, reportArgumentType=false, reportCallIssue=false, reportOptionalMemberAccess=false
# NOTE: The SDK calls take plain dicts; the SDK types are stricter than what the providers accept.

from collections.abc import AsyncIterator

import anthropic

from app.providers.base import BaseProvider, Delta, Message, ProviderError, Usage, map_exception, with_retry


class AnthropicProvider(BaseProvider):
    """Talks to the Anthropic API with the admin's key."""

    kind = "anthropic"

    def __init__(self, api_key: str) -> None:
        """Create the client.

        Args:
            api_key: The clear-text API key.
        """
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=120, max_retries=0)

    async def stream_chat(
        self, model: str, messages: list[Message], max_tokens: int | None = None
    ) -> AsyncIterator[Delta]:
        """Stream an answer.

        Args:
            model: Model id.
            messages: The conversation; system messages become the system prompt.
            max_tokens: Output limit (default 4096).

        Yields:
            Text pieces, then the token usage.
        """
        system = "\n\n".join(m.content for m in messages if m.role == "system")
        chat = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]
        kwargs: dict[str, object] = {"model": model, "max_tokens": max_tokens or 4096, "messages": chat}
        if system:
            kwargs["system"] = system
        try:
            async with self._client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    yield Delta(text=text)
                final = await stream.get_final_message()
                yield Delta(usage=Usage(final.usage.input_tokens, final.usage.output_tokens))
        except Exception as exc:
            raise map_exception(exc) from exc

    async def list_models(self) -> list[str]:
        """Return the available model ids."""

        async def call() -> list[str]:
            page = await self._client.models.list(limit=100)
            return [m.id for m in page.data]

        return await with_retry(call)

    def context_window(self, model: str) -> int:
        """Claude models have a 200,000 token context."""
        return 200_000

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        """Anthropic offers no embeddings."""
        raise ProviderError("Anthropic bietet keine Embeddings an.")
