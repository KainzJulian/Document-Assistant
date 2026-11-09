"""OpenAI adapter (chat and embeddings)."""

# pyright: basic, reportArgumentType=false, reportCallIssue=false, reportOptionalMemberAccess=false
# NOTE: The SDK calls take plain dicts; the SDK types are stricter than what the providers accept.

from collections.abc import AsyncIterator

import openai

from app.providers.base import BaseProvider, Delta, Message, Usage, map_exception, with_retry


class OpenAIProvider(BaseProvider):
    """Talks to the OpenAI API with the admin's key."""

    kind = "openai"

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        """Create the client.

        Args:
            api_key: The clear-text API key.
            base_url: Optional custom endpoint (OpenAI-compatible servers).
        """
        self._client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url or None, timeout=120, max_retries=0)

    async def stream_chat(
        self, model: str, messages: list[Message], max_tokens: int | None = None
    ) -> AsyncIterator[Delta]:
        """Stream an answer.

        Args:
            model: Model id.
            messages: The conversation.
            max_tokens: Optional output limit.

        Yields:
            Text pieces, then the token usage.
        """
        kwargs: dict[str, object] = {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if max_tokens:
            kwargs["max_completion_tokens"] = max_tokens
        try:
            stream = await self._client.chat.completions.create(**kwargs)
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield Delta(text=chunk.choices[0].delta.content)
                if chunk.usage:
                    yield Delta(usage=Usage(chunk.usage.prompt_tokens, chunk.usage.completion_tokens))
        except Exception as exc:
            raise map_exception(exc) from exc

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        """Return one vector per text.

        Args:
            model: Embedding model id.
            texts: The texts.

        Returns:
            The vectors in the same order.
        """

        async def call() -> list[list[float]]:
            response = await self._client.embeddings.create(model=model, input=texts)
            return [item.embedding for item in response.data]

        return await with_retry(call)

    async def list_models(self) -> list[str]:
        """Return the available model ids."""

        async def call() -> list[str]:
            page = await self._client.models.list()
            return sorted([m.id async for m in page])

        return await with_retry(call)

    def context_window(self, model: str) -> int:
        """Return a safe context size (128,000 tokens for current GPT models)."""
        return 128_000
