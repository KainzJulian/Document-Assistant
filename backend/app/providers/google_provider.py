"""Google (Gemini) adapter (chat and embeddings)."""

# pyright: basic, reportArgumentType=false, reportCallIssue=false, reportOptionalMemberAccess=false
# NOTE: The SDK calls take plain dicts; the SDK types are stricter than what the providers accept.

from collections.abc import AsyncIterator

from google import genai
from google.genai import types

from app.providers.base import BaseProvider, Delta, Message, Usage, map_exception, with_retry


class GoogleProvider(BaseProvider):
    """Talks to the Gemini API with the admin's key."""

    kind = "google"

    def __init__(self, api_key: str) -> None:
        """Create the client.

        Args:
            api_key: The clear-text API key.
        """
        self._client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=120_000))

    async def stream_chat(
        self, model: str, messages: list[Message], max_tokens: int | None = None
    ) -> AsyncIterator[Delta]:
        """Stream an answer.

        Args:
            model: Model id.
            messages: The conversation; system messages become the system instruction.
            max_tokens: Optional output limit.

        Yields:
            Text pieces, then the token usage.
        """
        system = "\n\n".join(m.content for m in messages if m.role == "system")
        contents = [
            types.Content(role="user" if m.role == "user" else "model", parts=[types.Part(text=m.content)])
            for m in messages
            if m.role != "system"
        ]
        config = types.GenerateContentConfig(system_instruction=system or None, max_output_tokens=max_tokens)
        usage: Usage | None = None
        try:
            stream = await self._client.aio.models.generate_content_stream(model=model, contents=contents, config=config)
            async for chunk in stream:
                if chunk.text:
                    yield Delta(text=chunk.text)
                meta = chunk.usage_metadata
                if meta:
                    usage = Usage(meta.prompt_token_count or 0, meta.candidates_token_count or 0)
        except Exception as exc:
            raise map_exception(exc) from exc
        if usage:
            yield Delta(usage=usage)

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        """Return one vector per text.

        Args:
            model: Embedding model id.
            texts: The texts.

        Returns:
            The vectors in the same order.
        """

        async def call() -> list[list[float]]:
            response = await self._client.aio.models.embed_content(model=model, contents=texts)
            return [list(e.values or []) for e in (response.embeddings or [])]

        return await with_retry(call)

    async def list_models(self) -> list[str]:
        """Return the available model ids (without the ``models/`` prefix)."""

        async def call() -> list[str]:
            pager = await self._client.aio.models.list()
            return sorted([(m.name or "").removeprefix("models/") async for m in pager])

        return await with_retry(call)

    def context_window(self, model: str) -> int:
        """Gemini models take about a million tokens."""
        return 1_000_000
