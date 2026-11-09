"""Ollama adapter (local models: chat, embeddings, model info for the hardware check)."""

# pyright: basic, reportArgumentType=false, reportCallIssue=false, reportOptionalMemberAccess=false
# NOTE: The SDK calls take plain dicts; the SDK types are stricter than what the providers accept.

from collections.abc import AsyncIterator
from dataclasses import dataclass

import ollama

from app.providers.base import BaseProvider, Delta, Message, Usage, map_exception, with_retry


@dataclass
class OllamaModelInfo:
    """What the hardware check needs to know about a local model.

    Attributes:
        file_gb: Size of the model file in GB.
        params_b: Parameter count in billions.
        quantization: Quantisation label such as ``Q4_K_M``.
        context: The model's maximum context length.
    """

    file_gb: float
    params_b: float
    quantization: str
    context: int


class OllamaProvider(BaseProvider):
    """Talks to an Ollama server; no API key."""

    kind = "ollama"

    def __init__(self, base_url: str) -> None:
        """Create the client.

        Args:
            base_url: Address of the Ollama server, e.g. ``http://ollama:11434``.
        """
        self._client = ollama.AsyncClient(host=base_url, timeout=300)

    async def stream_chat(
        self, model: str, messages: list[Message], max_tokens: int | None = None
    ) -> AsyncIterator[Delta]:
        """Stream an answer.

        Args:
            model: Model name.
            messages: The conversation.
            max_tokens: Optional output limit.

        Yields:
            Text pieces, then the token usage and generation time.
        """
        try:
            stream = await self._client.chat(
                model=model,
                messages=[{"role": m.role, "content": m.content} for m in messages],
                stream=True,
                options={"num_predict": max_tokens} if max_tokens else None,
            )
            async for chunk in stream:
                text = chunk["message"]["content"]
                if text:
                    yield Delta(text=text)
                if chunk.get("done"):
                    seconds = (chunk.get("eval_duration") or 0) / 1e9
                    yield Delta(
                        usage=Usage(chunk.get("prompt_eval_count") or 0, chunk.get("eval_count") or 0),
                        eval_seconds=seconds or None,
                    )
        except Exception as exc:
            raise map_exception(exc) from exc

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        """Return one vector per text.

        Args:
            model: Embedding model name.
            texts: The texts.

        Returns:
            The vectors in the same order.
        """

        async def call() -> list[list[float]]:
            response = await self._client.embed(model=model, input=texts)
            return [list(v) for v in response["embeddings"]]

        return await with_retry(call)

    async def list_models(self) -> list[str]:
        """Return the names of the installed models."""

        async def call() -> list[str]:
            response = await self._client.list()
            return sorted(m.model for m in response.models if m.model)

        return await with_retry(call)

    async def model_info(self, model: str) -> OllamaModelInfo:
        """Read size, parameters, quantisation and context length of an installed model.

        Args:
            model: Model name.

        Returns:
            The model's facts.
        """

        async def call() -> OllamaModelInfo:
            listing = await self._client.list()
            size = next((m.size or 0 for m in listing.models if m.model == model), 0)
            info = await self._client.show(model)
            details = info.details
            params = (details.parameter_size or "0").upper().rstrip("B")
            params_b = float(params[:-1]) / 1000 if params.endswith("M") else float(params or 0)
            context = next((int(v) for k, v in (info.modelinfo or {}).items() if k.endswith(".context_length")), 8192)
            return OllamaModelInfo(size / 1e9, params_b, details.quantization_level or "", context)

        return await with_retry(call)

    def context_window(self, model: str) -> int:
        """Return the default context Ollama runs models with (8,192 tokens)."""
        return 8192
