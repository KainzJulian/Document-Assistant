"""The provider interface, shared types and German error mapping."""

import asyncio
import re
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from typing import Literal, Protocol

Role = Literal["system", "user", "assistant"]


@dataclass(frozen=True)
class Message:
    """One chat message sent to a model."""

    role: Role
    content: str


@dataclass
class Usage:
    """Token counts reported by the provider."""

    tokens_in: int = 0
    tokens_out: int = 0


@dataclass
class Delta:
    """One item of a streamed answer: a piece of text, or (last) the token usage.

    Attributes:
        text: New text, may be empty.
        usage: Set on the final item.
        eval_seconds: Generation time reported by Ollama (used by the speed test).
    """

    text: str = ""
    usage: Usage | None = None
    eval_seconds: float | None = None


@dataclass
class Completion:
    """A finished answer."""

    text: str
    usage: Usage = field(default_factory=Usage)


class ProviderError(Exception):
    """A provider call failed. ``message`` is German and safe to show to the user.

    Attributes:
        message: German text for the user.
        status: HTTP status of the provider's answer, if there was one.
    """

    def __init__(self, message: str, status: int | None = None) -> None:
        """Create the error.

        Args:
            message: German text for the user.
            status: HTTP status of the provider's answer, if any.
        """
        super().__init__(message)
        self.message = message
        self.status = status


def map_exception(exc: BaseException) -> ProviderError:
    """Turn any SDK exception into a ``ProviderError`` with a German message.

    SDK exceptions are recognised by their ``status_code`` or ``code`` attribute and by their
    class name, so no SDK-specific imports are needed here. API keys never appear in the text.

    Args:
        exc: The caught exception.

    Returns:
        The mapped error.
    """
    if isinstance(exc, ProviderError):
        return exc
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    status = status if isinstance(status, int) else None
    name = type(exc).__name__.lower()
    if status in (401, 403) or "authentication" in name or "permission" in name:
        return ProviderError("Der API-Schlüssel wurde abgelehnt oder fehlt.", status)
    if status == 404 or "notfound" in name:
        return ProviderError("Das Modell oder die Adresse wurde nicht gefunden.", status)
    if status == 429 or "ratelimit" in name:
        return ProviderError("Der Anbieter ist gerade überlastet (Rate-Limit). Bitte gleich noch einmal versuchen.", 429)
    if "timeout" in name or isinstance(exc, TimeoutError | asyncio.TimeoutError):
        return ProviderError("Der Anbieter hat nicht rechtzeitig geantwortet.", status)
    if "connect" in name or isinstance(exc, ConnectionError | OSError):
        return ProviderError("Der Anbieter ist nicht erreichbar.", status)
    return ProviderError("Der Anbieter hat einen Fehler gemeldet.", status)


async def with_retry[T](call: Callable[[], Awaitable[T]]) -> T:
    """Run a provider call, retrying once after a rate limit.

    Args:
        call: Function that makes the call each time it is invoked.

    Returns:
        The call's result.

    Raises:
        ProviderError: With a German message if the call fails (also after the retry).
    """
    try:
        return await call()
    except Exception as exc:
        error = map_exception(exc)
        if error.status != 429:
            raise error from exc
    await asyncio.sleep(2)
    try:
        return await call()
    except Exception as exc:
        raise map_exception(exc) from exc


_EMBEDDING_HINT = re.compile(r"embed|bge|minilm|nomic|e5-|gte-", re.IGNORECASE)


def is_embedding_model(name: str) -> bool:
    """Guess from the model name whether it produces embeddings instead of chat answers."""
    return bool(_EMBEDDING_HINT.search(name))


class LlmProvider(Protocol):
    """What every provider adapter offers."""

    kind: str

    def stream_chat(
        self, model: str, messages: list[Message], max_tokens: int | None = None
    ) -> AsyncIterator[Delta]:
        """Stream an answer; the last item carries the token usage."""
        ...

    async def complete(
        self, model: str, messages: list[Message], max_tokens: int | None = None
    ) -> Completion:
        """Return a whole answer."""
        ...

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        """Return one vector per text."""
        ...

    async def list_models(self) -> list[str]:
        """Return the model ids the provider offers."""
        ...

    def context_window(self, model: str) -> int:
        """Return the model's context size in tokens (best known value)."""
        ...

    def count_tokens(self, model: str, text: str) -> int:
        """Return an estimate of the token count of a text."""
        ...


class BaseProvider:
    """Shared behaviour: ``complete`` from ``stream_chat`` and a token estimate."""

    kind = "base"

    def stream_chat(
        self, model: str, messages: list[Message], max_tokens: int | None = None
    ) -> AsyncIterator[Delta]:
        """Stream an answer (implemented by each adapter)."""
        raise NotImplementedError

    async def complete(
        self, model: str, messages: list[Message], max_tokens: int | None = None
    ) -> Completion:
        """Collect a streamed answer into one text.

        Args:
            model: Model id.
            messages: The conversation.
            max_tokens: Optional output limit.

        Returns:
            The text and the token usage.
        """
        parts: list[str] = []
        usage = Usage()
        async for delta in self.stream_chat(model, messages, max_tokens):
            parts.append(delta.text)
            if delta.usage:
                usage = delta.usage
        return Completion("".join(parts), usage)

    def count_tokens(self, model: str, text: str) -> int:
        """Estimate tokens as one per 3.5 characters (German text; real tokenizers differ a little).

        Args:
            model: Model id (unused by the estimate).
            text: The text.

        Returns:
            The estimated token count.
        """
        return max(1, round(len(text) / 3.5))

    def context_window(self, model: str) -> int:
        """Return a conservative default context size; adapters override this."""
        return 8192

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        """Embeddings are not available for this provider."""
        raise ProviderError("Dieser Anbieter bietet keine Embeddings an.")
