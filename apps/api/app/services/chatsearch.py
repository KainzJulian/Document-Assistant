"""Keyword search over chat titles and messages, typo tolerant (pg_trgm), German and English."""

import difflib
import re
import uuid

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models import Chat, User
from app.models.chats import ChatSummary

LIMIT = 30
SIMILARITY = 0.4


def _snippet(content: str, query: str) -> str:
    """Return a short excerpt with the best matching word marked as ``[[word]]``.

    The word is chosen by similarity, so a misspelt query still marks the right word.
    """
    words = [w for w in re.findall(r"\w{2,}", query.lower())]
    tokens = list(re.finditer(r"\w{2,}", content))
    best, best_ratio = None, 0.0
    for token in tokens:
        for word in words:
            ratio = difflib.SequenceMatcher(None, word, token.group().lower()).ratio()
            if ratio > best_ratio:
                best, best_ratio = token, ratio
    if best is None or best_ratio < 0.6:
        return content[:140].strip()
    start = max(0, best.start() - 60)
    end = min(len(content), best.end() + 80)
    excerpt = f"{content[start:best.start()]}[[{best.group()}]]{content[best.end():end]}"
    return ("…" if start else "") + excerpt.replace("\n", " ").strip() + ("…" if end < len(content) else "")


def search_chats(db: Session, user: User, q: str) -> list[ChatSummary]:
    """List chats, or search them.

    Without a query: all chats of the person, newest first. With a query: chats whose title or
    messages contain the words or something similar (a misspelling such as "Zusamenfassung" still
    finds "Zusammenfassung"), best match first, with a snippet and the id of the matching message.

    Args:
        db: Database session.
        user: The logged-in person (only their own chats are searched).
        q: The search text.

    Returns:
        Chat summaries; at most 500 without a query and 30 with one.
    """
    q = q.strip()
    if not q:
        chats = db.scalars(select(Chat).where(Chat.owner_id == user.id).order_by(Chat.updated_at.desc()).limit(500)).all()
        return [ChatSummary(id=c.id, title=c.title, created_at=c.created_at, updated_at=c.updated_at) for c in chats]

    db.execute(text(f"SET LOCAL pg_trgm.word_similarity_threshold = {SIMILARITY}"))
    words = re.findall(r"\w{2,}", q.lower())
    tsquery = " | ".join(words[:8]) or q
    rows = db.execute(
        text(
            """
            WITH message_hits AS (
              SELECT DISTINCT ON (m.chat_id) m.chat_id, m.id AS message_id, m.content,
                     GREATEST(word_similarity(:q, m.content),
                              CASE WHEN m.tsv @@ to_tsquery('simple', immutable_unaccent(:ts)) THEN 1 ELSE 0 END) AS score
              FROM messages m JOIN chats c ON c.id = m.chat_id
              WHERE c.owner_id = :uid
                AND (:q <% m.content OR m.tsv @@ to_tsquery('simple', immutable_unaccent(:ts)))
              ORDER BY m.chat_id, score DESC
            ),
            title_hits AS (
              SELECT c.id AS chat_id, word_similarity(:q, c.title) AS score
              FROM chats c WHERE c.owner_id = :uid AND c.title IS NOT NULL AND :q <% c.title
            )
            SELECT c.id, c.title, c.created_at, c.updated_at, mh.message_id, mh.content,
                   GREATEST(COALESCE(mh.score, 0), COALESCE(th.score, 0) + 0.1) AS score
            FROM chats c
            LEFT JOIN message_hits mh ON mh.chat_id = c.id
            LEFT JOIN title_hits th ON th.chat_id = c.id
            WHERE c.owner_id = :uid AND (mh.chat_id IS NOT NULL OR th.chat_id IS NOT NULL)
            ORDER BY score DESC, c.updated_at DESC
            LIMIT :limit
            """
        ),
        {"q": q, "ts": tsquery, "uid": user.id, "limit": LIMIT},
    ).all()
    results: list[ChatSummary] = []
    for chat_id, title, created, updated, message_id, content, _ in rows:
        results.append(
            ChatSummary(
                id=chat_id,
                title=title,
                created_at=created,
                updated_at=updated,
                snippet=_snippet(content, q) if content else None,
                message_id=message_id if isinstance(message_id, uuid.UUID) else None,
            )
        )
    return results
