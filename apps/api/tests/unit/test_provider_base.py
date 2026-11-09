"""Provider error mapping, retry, token estimate and the shared base class."""

import asyncio
from collections.abc import AsyncIterator

import pytest

from app.providers import base
from app.providers.base import (
    BaseProvider,
    Delta,
    Message,
    ProviderError,
    Usage,
    is_embedding_model,
    map_exception,
    with_retry,
)


class AuthenticationError(Exception):
    """Looks like an SDK error by its class name."""


class RateLimitError(Exception):
    """Looks like an SDK error by its class name."""


class APIConnectionError(Exception):
    """Looks like an SDK error by its class name."""


class WithStatus(Exception):
    """An error with an HTTP status attribute."""

    def __init__(self, status: object) -> None:
        super().__init__("status")
        self.status_code = status


@pytest.mark.parametrize(
    ("exc", "text", "status"),
    [
        (WithStatus(401), "API-Schlüssel", 401),
        (WithStatus(403), "API-Schlüssel", 403),
        (AuthenticationError("sk-geheim"), "API-Schlüssel", None),
        (WithStatus(404), "nicht gefunden", 404),
        (WithStatus(429), "Rate-Limit", 429),
        (RateLimitError("zu viel"), "Rate-Limit", 429),
        (TimeoutError(), "nicht rechtzeitig", None),
        (asyncio.TimeoutError(), "nicht rechtzeitig", None),
        (APIConnectionError("x"), "nicht erreichbar", None),
        (ConnectionRefusedError(), "nicht erreichbar", None),
        (WithStatus(500), "Fehler gemeldet", 500),
        (ValueError("irgendwas"), "Fehler gemeldet", None),
    ],
)
def test_exceptions_become_german_provider_errors(exc: BaseException, text: str, status: int | None) -> None:
    error = map_exception(exc)
    assert isinstance(error, ProviderError) and text in error.message and error.status == status


def test_a_status_that_is_not_a_number_is_ignored() -> None:
    assert map_exception(WithStatus("boom")).status is None


def test_the_original_text_of_an_sdk_error_never_reaches_the_user() -> None:
    assert "sk-geheim" not in map_exception(AuthenticationError("Incorrect key sk-geheim")).message


def test_a_provider_error_passes_through_unchanged() -> None:
    original = ProviderError("Schon deutsch.", 418)
    assert map_exception(original) is original


def run_retry(results: list[BaseException | str], monkeypatch: pytest.MonkeyPatch) -> tuple[str | ProviderError, int, list[float]]:
    """Run ``with_retry`` over scripted outcomes; returns (result, calls, sleeps)."""
    calls, sleeps = 0, []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    async def call() -> str:
        nonlocal calls
        outcome = results[calls]
        calls += 1
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    monkeypatch.setattr(base.asyncio, "sleep", fake_sleep)
    try:
        return asyncio.run(with_retry(call)), calls, sleeps
    except ProviderError as error:
        return error, calls, sleeps


def test_retry_succeeds_first_time_without_waiting(monkeypatch: pytest.MonkeyPatch) -> None:
    assert run_retry(["ok"], monkeypatch) == ("ok", 1, [])


def test_retry_tries_again_once_after_a_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    assert run_retry([WithStatus(429), "ok"], monkeypatch) == ("ok", 2, [2])


def test_retry_gives_up_after_the_second_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    result, calls, _ = run_retry([WithStatus(429), WithStatus(429)], monkeypatch)
    assert isinstance(result, ProviderError) and result.status == 429 and calls == 2


def test_retry_does_not_repeat_other_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    result, calls, sleeps = run_retry([WithStatus(500), "ok"], monkeypatch)
    assert isinstance(result, ProviderError) and calls == 1 and sleeps == []


class Scripted(BaseProvider):
    """A provider that streams fixed pieces."""

    kind = "scripted"

    async def stream_chat(self, model: str, messages: list[Message], max_tokens: int | None = None) -> AsyncIterator[Delta]:
        """Stream two pieces and the usage."""
        yield Delta(text="Hallo ")
        yield Delta(text="Welt")
        yield Delta(usage=Usage(3, 2))


def test_complete_joins_the_stream_and_keeps_the_usage() -> None:
    result = asyncio.run(Scripted().complete("m", [Message("user", "x")]))
    assert result.text == "Hallo Welt" and (result.usage.tokens_in, result.usage.tokens_out) == (3, 2)


def test_token_estimate_is_one_per_three_and_a_half_characters() -> None:
    provider = BaseProvider()
    assert provider.count_tokens("m", "a" * 35) == 10
    assert provider.count_tokens("m", "") == 1
    assert provider.context_window("m") == 8192


def test_base_provider_has_no_embeddings() -> None:
    with pytest.raises(ProviderError):
        asyncio.run(BaseProvider().embed("m", ["x"]))


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("bge-m3", True),
        ("nomic-embed-text", True),
        ("text-embedding-3-small", True),
        ("all-minilm", True),
        ("llama3.1:8b", False),
        ("claude-sonnet-5-5", False),
        ("gpt-5", False),
    ],
)
def test_embedding_models_are_recognised_by_name(name: str, expected: bool) -> None:
    assert is_embedding_model(name) is expected
