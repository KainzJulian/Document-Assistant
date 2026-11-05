"""Ollama hardware check: does the selected model fit this server?"""

import asyncio

from fastapi import APIRouter
from sqlalchemy import select

from app.config import get_settings
from app.db.models import OllamaAcknowledgement, Provider
from app.deps import CurrentUser, DbSession
from app.errors import ApiError
from app.models.ai import BenchmarkIn, BenchmarkOut, GpuOut, OllamaFitOut
from app.providers.base import Message, ProviderError
from app.providers.ollama_provider import OllamaProvider
from app.services.hardware import SEVERITY, estimate_words_per_s, need_gb, read_hardware, verdict_for

router = APIRouter(prefix="/hardware", tags=["hardware"])


def _ollama(db: DbSession) -> OllamaProvider:
    """Return the adapter for the first enabled Ollama provider (or the default address)."""
    row = db.scalar(select(Provider).where(Provider.kind == "ollama", Provider.enabled.is_(True)).order_by(Provider.id))
    return OllamaProvider((row.base_url if row else None) or get_settings().ollama_url)


def _unreachable(error: ProviderError) -> ApiError:
    """Build the error shown in settings when Ollama cannot be asked."""
    return ApiError(503, "ollama_unreachable", "Ollama nicht erreichbar." if error.status is None else error.message)


@router.get("/ollama-fit")
async def ollama_fit(model: str, user: CurrentUser, db: DbSession) -> OllamaFitOut:
    """Compare the server's free RAM and GPU memory with what the model needs.

    Args:
        model: Ollama model name.
        user: The logged-in person.
        db: Database session.

    Returns:
        Numbers, the verdict and whether the warning dialog must be shown (never accepted before,
        or the verdict got worse since).
    """
    try:
        info = await _ollama(db).model_info(model)
    except ProviderError as error:
        raise _unreachable(error) from error
    hw = read_hardware()
    need = need_gb(info.file_gb, info.params_b, min(info.context, get_settings().ollama_context))
    verdict = verdict_for(need, hw)
    ack = db.get(OllamaAcknowledgement, (user.id, model))
    acknowledged = ack.verdict if ack else None
    needs_warning = verdict != "fits" and (acknowledged is None or SEVERITY[verdict] > SEVERITY.get(acknowledged, 0))
    return OllamaFitOut(
        model=model,
        ram_total_gb=round(hw.ram_total_gb, 1),
        ram_free_gb=round(hw.ram_free_gb, 1),
        gpu=GpuOut(name=hw.gpu_name, vram_total_gb=round(hw.vram_total_gb, 1), vram_free_gb=round(hw.vram_free_gb, 1))
        if hw.gpu_name
        else None,
        need_gb=round(need, 1),
        verdict=verdict,  # type: ignore[arg-type]
        est_words_per_s=estimate_words_per_s(info.file_gb) if verdict in ("cpu_only", "partial") else None,
        needs_warning=needs_warning,
        acknowledged=acknowledged,
    )


@router.post("/ollama-benchmark")
async def ollama_benchmark(body: BenchmarkIn, _: CurrentUser, db: DbSession) -> BenchmarkOut:
    """Generate for a short while and report the measured speed in words per second.

    Args:
        body: The model to test.
        _: The logged-in person.
        db: Database session.

    Returns:
        Words per second, tokens and seconds measured by Ollama.
    """
    provider = _ollama(db)
    prompt = [Message("user", "Schreibe einen kurzen Text über den Wald.")]

    async def run() -> BenchmarkOut:
        tokens, seconds = 0, 0.0
        async for delta in provider.stream_chat(body.model, prompt, max_tokens=60):
            if delta.usage:
                tokens = delta.usage.tokens_out
            if delta.eval_seconds:
                seconds = delta.eval_seconds
        if not tokens or not seconds:
            raise ApiError(502, "benchmark_empty", "Die Messung hat kein Ergebnis geliefert.")
        return BenchmarkOut(words_per_s=round(tokens / seconds * 0.75, 1), tokens=tokens, seconds=round(seconds, 1))

    try:
        return await asyncio.wait_for(run(), timeout=60)
    except ProviderError as error:
        raise _unreachable(error) from error
    except TimeoutError:
        raise ApiError(504, "benchmark_timeout", "Die Messung hat zu lange gedauert.") from None
