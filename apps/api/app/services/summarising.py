"""Summaries in five lengths: target words, the third-of-source cap, single call or part by part,
a length check with one rewrite, and saving one summary per document and length."""

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Document, DocumentText, Summary
from app.db.session import get_engine
from app.models.summaries import SummaryOut
from app.providers.base import LlmProvider, Message, ProviderError
from app.services.answering import event
from app.services.extractors import PAGE_MARKER

log = logging.getLogger(__name__)

TARGETS = {"xs": 50, "s": 150, "m": 300, "l": 600, "xl": 1200}
TOLERANCE = 0.2
PART_WORDS = 3000
CONTEXT_SHARE = 0.6

_SYSTEM = (
    "Du fasst Texte zusammen. Regeln: Das Wichtigste kommt zuerst. Füge nichts hinzu, was nicht im Text "
    "steht. Gib nur die Zusammenfassung aus, ohne Einleitung. Die Länge soll etwa {n} Wörter betragen. {lang}"
)
_LANG = {
    "source": "Schreibe in der Sprache des Textes.",
    "de": "Schreibe auf Deutsch (übersetze, wenn der Text in einer anderen Sprache ist).",
}


@dataclass
class SummaryContext:
    """Everything the summary stream needs, prepared before the stream starts.

    Attributes:
        document_id: The document.
        user_id: The person asking.
        length: ``xs``, ``s``, ``m``, ``l`` or ``xl``.
        language: ``source`` or ``de``.
        provider: Model provider of the person.
        provider_kind: Kind label saved with the summary.
        model: Model name.
    """

    document_id: uuid.UUID
    user_id: uuid.UUID
    length: str
    language: str
    provider: LlmProvider
    provider_kind: str
    model: str


def effective_target(length: str, source_words: int) -> tuple[int, str | None]:
    """Return the target word count (never more than a third of the source) and a note if capped.

    Args:
        length: ``xs``, ``s``, ``m``, ``l`` or ``xl``.
        source_words: Words in the source document.

    Returns:
        The target and, if the cap applied, the German note shown to the person.
    """
    nominal = TARGETS[length]
    cap = max(10, source_words // 3)
    if nominal <= cap:
        return nominal, None
    return cap, f"Quelle ist kurz – auf {cap} Wörter begrenzt"


def within_tolerance(words: int, target: int) -> bool:
    """Whether a summary length is within 20 percent of the target."""
    return abs(words - target) <= TOLERANCE * target


def split_parts(markdown: str, size: int = PART_WORDS) -> list[str]:
    """Group the paragraphs of a document into parts of about ``size`` words.

    Args:
        markdown: Extracted text (page markers are dropped).
        size: Target words per part.

    Returns:
        The parts in order.
    """
    paragraphs = [p.strip() for p in PAGE_MARKER.sub("", markdown).split("\n\n") if p.strip()]
    parts: list[list[str]] = [[]]
    count = 0
    for paragraph in paragraphs:
        n = len(paragraph.split())
        if count + n > size and parts[-1]:
            parts.append([])
            count = 0
        parts[-1].append(paragraph)
        count += n
    return ["\n\n".join(p) for p in parts if p]


def to_out(summary: Summary, source_words: int) -> SummaryOut:
    """Build the API model of a summary.

    Args:
        summary: The saved summary.
        source_words: Words of the source document (decides the "capped" note).

    Returns:
        The API model.
    """
    nominal = TARGETS[summary.length]
    note = effective_target(summary.length, source_words)[1]
    return SummaryOut(
        id=summary.id,
        length=summary.length,
        text=summary.text,
        word_count=summary.word_count,
        target_words=summary.target_words,
        nominal_words=nominal,
        note=note,
        provider=summary.provider,
        model=summary.model,
        created_at=summary.created_at,
    )


def _load(document_id: uuid.UUID) -> tuple[str, int]:
    """Load the document text and its word count."""
    with Session(get_engine()) as db:
        text = db.get(DocumentText, document_id)
        doc = db.get(Document, document_id)
        if text is None or doc is None:
            raise ProviderError("Der Text des Dokuments ist nicht verfügbar.")
        return text.markdown, doc.word_count or len(text.markdown.split())


def _save(ctx: SummaryContext, text: str, target: int, source_words: int) -> SummaryOut:
    """Save (replace) the summary of this document and length."""
    with Session(get_engine()) as db:
        row = db.scalar(select(Summary).where(Summary.document_id == ctx.document_id, Summary.length == ctx.length))
        if row is None:
            row = Summary(document_id=ctx.document_id, length=ctx.length)
            db.add(row)
        row.text = text
        row.word_count = len(text.split())
        row.target_words = target
        row.provider = ctx.provider_kind
        row.model = ctx.model
        row.created_by = ctx.user_id
        row.created_at = datetime.now(UTC)
        db.commit()
        db.refresh(row)
        return to_out(row, source_words)


async def _single(ctx: SummaryContext, text: str, target: int) -> AsyncIterator[str]:
    """Stream a summary of a text that fits the model's context in one call."""
    system = _SYSTEM.format(n=target, lang=_LANG[ctx.language])
    async for delta in ctx.provider.stream_chat(ctx.model, [Message("system", system), Message("user", text)]):
        if delta.text:
            yield delta.text


async def stream_summary(ctx: SummaryContext) -> AsyncIterator[str]:
    """Create a summary and stream it as Server-Sent Events.

    Events: ``progress`` {step, of, label}, ``reset`` (the text restarts after a rewrite), ``token``,
    ``done`` {summary}, ``error`` {message}.

    Args:
        ctx: The prepared context.

    Yields:
        Formatted SSE events.
    """
    try:
        markdown, source_words = await asyncio.to_thread(_load, ctx.document_id)
        target, _ = effective_target(ctx.length, source_words)
        source = PAGE_MARKER.sub("", markdown).strip()
        tokens = ctx.provider.count_tokens(ctx.model, source)
        pieces: list[str] = []
        if tokens <= CONTEXT_SHARE * ctx.provider.context_window(ctx.model):
            async for token in _single(ctx, source, target):
                pieces.append(token)
                yield event("token", {"text": token})
        else:
            parts = split_parts(markdown)
            summaries: list[str] = []
            part_system_lang = _LANG[ctx.language]
            for i, part in enumerate(parts, start=1):
                yield event("progress", {"step": i, "of": len(parts), "label": f"Teil {i} von {len(parts)}"})
                share = max(40, round(target * 1.5 * len(part.split()) / max(source_words, 1)))
                result = await ctx.provider.complete(
                    ctx.model,
                    [Message("system", _SYSTEM.format(n=share, lang=part_system_lang)), Message("user", part)],
                )
                summaries.append(result.text.strip())
            yield event("progress", {"step": len(parts), "of": len(parts), "label": "Teile zusammenführen"})
            combine = (
                "Die folgenden Teilzusammenfassungen stammen aus aufeinanderfolgenden Teilen eines langen Dokuments. "
                f"Fasse sie zu einer zusammenhängenden Zusammenfassung von etwa {target} Wörtern zusammen. "
                f"Das Wichtigste kommt zuerst, erfinde nichts. {part_system_lang}"
            )
            joined = "\n\n".join(f"Teil {n}:\n{s}" for n, s in enumerate(summaries, start=1))
            async for delta in ctx.provider.stream_chat(ctx.model, [Message("system", combine), Message("user", joined)]):
                if delta.text:
                    pieces.append(delta.text)
                    yield event("token", {"text": delta.text})
        text = "".join(pieces).strip()
        if not within_tolerance(len(text.split()), target):
            yield event("progress", {"step": 1, "of": 1, "label": "Länge anpassen"})
            yield event("reset", {})
            fix = (
                f"Der folgende Text hat {len(text.split())} Wörter, er soll etwa {target} Wörter lang sein. "
                f"Schreibe ihn entsprechend um, ohne Inhalte zu erfinden. Gib nur den Text aus. {_LANG[ctx.language]}"
            )
            rewritten: list[str] = []
            async for delta in ctx.provider.stream_chat(ctx.model, [Message("system", fix), Message("user", text)]):
                if delta.text:
                    rewritten.append(delta.text)
                    yield event("token", {"text": delta.text})
            text = "".join(rewritten).strip() or text
        saved = await asyncio.to_thread(_save, ctx, text, target, source_words)
        yield event("done", {"summary": saved.model_dump(mode="json")})
    except ProviderError as error:
        yield event("error", {"message": error.message})
    except Exception:
        log.exception("Summary failed")
        yield event("error", {"message": "Die Zusammenfassung konnte nicht erstellt werden."})

