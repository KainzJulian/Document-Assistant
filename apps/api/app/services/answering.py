"""Answer a question about selected documents, streaming the answer and saving it as it arrives."""

import asyncio
import json
import logging
import re
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Chat, Message as MessageRow, User
from app.db.session import get_engine
from app.providers.base import LlmProvider, Message, ProviderError, Usage
from app.services.retrieval import Passage, retrieve

log = logging.getLogger(__name__)

NOT_FOUND = "Dazu finde ich in den ausgewählten Dokumenten nichts."
HISTORY_MESSAGES = 8  # the last 4 turns
SAVE_EVERY_SECONDS = 1.5

_SYSTEM = f"""Du beantwortest Fragen ausschließlich anhand der unten genannten Textstellen aus den Dokumenten des Nutzers.
Regeln:
- Nutze nur diese Textstellen. Erfinde nichts und nutze kein Wissen von außerhalb.
- Belege jede Aussage mit der Nummer der Textstelle in eckigen Klammern, zum Beispiel [1] oder [2][3].
- Antworte in der Sprache der Frage.
- Wenn die Textstellen die Antwort nicht enthalten, antworte genau mit: "{NOT_FOUND}"
- Antworte knapp und sachlich. Nutze Markdown (Listen, Fettdruck) nur, wenn es hilft."""

_REWRITE = (
    "Formuliere die letzte Frage des Nutzers so um, dass sie ohne den Gesprächsverlauf verständlich ist. "
    "Behalte die Sprache bei. Antworte nur mit der umformulierten Frage."
)
_TITLE = "Gib dem Gespräch einen kurzen deutschen Titel mit höchstens sechs Wörtern. Antworte nur mit dem Titel."


@dataclass
class AnswerContext:
    """Everything the answer stream needs, prepared before the stream starts.

    Attributes:
        chat_id: The chat.
        user_id: The asking person.
        assistant_id: Id of the (still empty) assistant message to fill.
        question: The question as typed.
        history: Previous messages (last 4 turns) without the current question.
        document_ids: Documents selected for the chat.
        provider: The model provider of the person.
        provider_kind: Kind label stored with the message.
        model: Model name.
        first_answer: True for the first answer of an untitled chat (a title is generated).
    """

    chat_id: uuid.UUID
    user_id: uuid.UUID
    assistant_id: uuid.UUID
    question: str
    history: list[Message]
    document_ids: list[uuid.UUID]
    provider: LlmProvider
    provider_kind: str
    model: str
    first_answer: bool


def event(name: str, data: object) -> str:
    """Format one Server-Sent Event."""
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def build_messages(ctx: AnswerContext, passages: list[Passage]) -> list[Message]:
    """Assemble the prompt: rules and numbered passages, the last turns, the question.

    Args:
        ctx: The answer context.
        passages: Retrieved passages, numbered [1] to [n] in this order.

    Returns:
        The messages to send to the model.
    """
    blocks = []
    for n, p in enumerate(passages, start=1):
        where = f"Dokument: {p.document_title}"
        if p.page_from:
            where += f", Seite {p.page_from}" + (f"-{p.page_to}" if p.page_to and p.page_to != p.page_from else "")
        if p.section_path:
            where += f", Abschnitt: {p.section_path}"
        blocks.append(f"[{n}] ({where})\n{p.text}")
    context = "Textstellen:\n\n" + "\n\n".join(blocks) if blocks else "Textstellen: (keine gefunden)"
    return [Message("system", f"{_SYSTEM}\n\n{context}"), *ctx.history, Message("user", ctx.question)]


def citations_for(text: str, passages: list[Passage]) -> list[dict[str, object]]:
    """List the passages the answer cites, in the order they first appear.

    Args:
        text: The finished answer.
        passages: The numbered passages.

    Returns:
        Citation dictionaries (number, chunk, document, pages, section).
    """
    seen: list[int] = []
    for match in re.finditer(r"\[(\d+)\]", text):
        n = int(match.group(1))
        if 1 <= n <= len(passages) and n not in seen:
            seen.append(n)
    return [
        {
            "n": n,
            "chunk_id": str(passages[n - 1].chunk_id),
            "document_id": str(passages[n - 1].document_id),
            "document_title": passages[n - 1].document_title,
            "page_from": passages[n - 1].page_from,
            "page_to": passages[n - 1].page_to,
            "section_path": passages[n - 1].section_path,
        }
        for n in sorted(seen)
    ]


def _save(ctx: AnswerContext, text: str, citations: list[dict[str, object]] | None = None, usage: Usage | None = None) -> None:
    """Save the answer so far (or finished) into the assistant message. Synchronous on purpose, so it
    also works while the request is being cancelled."""
    with Session(get_engine()) as db:
        row = db.get(MessageRow, ctx.assistant_id)
        if row is None:
            return
        row.content = text
        if citations is not None:
            row.citations = citations
        if usage is not None:
            row.tokens_in = usage.tokens_in
            row.tokens_out = usage.tokens_out
        chat = db.get(Chat, ctx.chat_id)
        if chat is not None:
            chat.updated_at = datetime.now(UTC)
            chat.provider, chat.model = ctx.provider_kind, ctx.model
        db.commit()


async def _standalone(ctx: AnswerContext) -> str:
    """Rewrite a follow-up question so it makes sense alone (second message onwards)."""
    if not ctx.history:
        return ctx.question
    transcript = "\n".join(
        f"{'Nutzer' if m.role == 'user' else 'Assistent'}: {m.content[:600]}" for m in ctx.history
    )
    prompt = [Message("system", _REWRITE), Message("user", f"Verlauf:\n{transcript}\n\nLetzte Frage: {ctx.question}")]
    try:
        text = (await ctx.provider.complete(ctx.model, prompt, max_tokens=150)).text.strip()
    except ProviderError:
        return ctx.question
    return text or ctx.question


async def _title(ctx: AnswerContext, answer: str) -> str:
    """Make a short German chat title (fallback: the first six words of the question)."""
    fallback = " ".join(ctx.question.split()[:6])
    try:
        text = (
            await ctx.provider.complete(
                ctx.model,
                [Message("system", _TITLE), Message("user", f"Frage: {ctx.question}\nAntwort: {answer[:500]}")],
                max_tokens=30,
            )
        ).text
    except ProviderError:
        return fallback
    return text.strip().strip("\"'„“").rstrip(".") or fallback


async def stream_answer(ctx: AnswerContext) -> AsyncIterator[str]:
    """Run retrieval and the model and stream the result as Server-Sent Events.

    Events: ``token`` {text}, ``citations`` [...], ``done`` {message_id, tokens_in, tokens_out},
    ``title`` {title} (first answer only) and ``error`` {message}. The answer is saved every
    1.5 seconds and when the client disconnects, so an interrupted answer keeps what arrived.

    Args:
        ctx: The prepared context.

    Yields:
        Formatted SSE events.
    """
    parts: list[str] = []
    usage: Usage | None = None
    passages: list[Passage] = []
    last_save = time.monotonic()
    try:
        with Session(get_engine()) as db:
            user = db.get(User, ctx.user_id)
            if user is None:
                return
            question = await _standalone(ctx)
            passages = await retrieve(db, user, question, ctx.document_ids)
        async for delta in ctx.provider.stream_chat(ctx.model, build_messages(ctx, passages)):
            if delta.text:
                parts.append(delta.text)
                yield event("token", {"text": delta.text})
                if time.monotonic() - last_save > SAVE_EVERY_SECONDS:
                    _save(ctx, "".join(parts))
                    last_save = time.monotonic()
            if delta.usage:
                usage = delta.usage
        answer = "".join(parts)
        cites = citations_for(answer, passages)
        used = usage or Usage(0, max(1, len(answer) // 4))
        _save(ctx, answer, cites, used)
        yield event("citations", cites)
        yield event("done", {"message_id": str(ctx.assistant_id), "tokens_in": used.tokens_in, "tokens_out": used.tokens_out})
        if ctx.first_answer and answer.strip():
            title = await _title(ctx, answer)
            with Session(get_engine()) as db:
                chat = db.get(Chat, ctx.chat_id)
                if chat is not None and not chat.title:
                    chat.title = title[:200]
                    db.commit()
            yield event("title", {"title": title})
    except asyncio.CancelledError:
        _save(ctx, "".join(parts))
        raise
    except ProviderError as error:
        _save(ctx, "".join(parts))
        yield event("error", {"message": error.message})
    except Exception:
        log.exception("Answer failed")
        _save(ctx, "".join(parts))
        yield event("error", {"message": "Die Antwort konnte nicht erstellt werden."})


def history_messages(db: Session, chat_id: uuid.UUID, before: datetime | None = None) -> list[Message]:
    """Return the last 4 turns of a chat as prompt messages, oldest first.

    Args:
        db: Database session.
        chat_id: The chat.
        before: Only messages created before this time (used when regenerating).

    Returns:
        Up to 8 messages; unfinished assistant messages are left out.
    """
    query = select(MessageRow).where(MessageRow.chat_id == chat_id)
    if before is not None:
        query = query.where(MessageRow.created_at < before)
    rows = db.scalars(query.order_by(MessageRow.created_at.desc()).limit(HISTORY_MESSAGES + 2)).all()
    usable = [r for r in rows if r.role == "user" or r.tokens_out is not None]
    usable = usable[:HISTORY_MESSAGES]
    return [Message("user" if r.role == "user" else "assistant", r.content) for r in reversed(usable)]


def count_answers(db: Session, chat_id: uuid.UUID) -> int:
    """Count the assistant messages of a chat."""
    return db.scalar(select(func.count()).select_from(MessageRow).where(MessageRow.chat_id == chat_id, MessageRow.role == "assistant")) or 0
