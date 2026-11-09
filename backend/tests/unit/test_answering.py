"""Prompt building, citation extraction and the SSE format of the chat answer."""

import json
import uuid

from app.providers.base import Message
from app.providers.fake import FakeProvider
from app.services.answering import NOT_FOUND, AnswerContext, build_messages, citations_for, event
from app.services.retrieval import Passage


def passage(title: str = "Mietvertrag", text: str = "Text", page_from: int | None = None, page_to: int | None = None, section: str | None = None) -> Passage:
    """A retrieved passage."""
    return Passage(uuid.uuid4(), uuid.uuid4(), title, section, page_from, page_to, text, 0.1, 1, None)


def context(history: list[Message] | None = None, question: str = "Wie lange?") -> AnswerContext:
    """An answer context without any database ids that matter."""
    return AnswerContext(uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), question, history or [], [], FakeProvider(), "fake", "fake-chat", True)


def test_events_are_formatted_for_server_sent_events() -> None:
    text = event("token", {"text": "Größe"})
    assert text == 'event: token\ndata: {"text": "Größe"}\n\n'
    assert json.loads(text.split("data: ")[1]) == {"text": "Größe"}


def test_prompt_numbers_the_passages_and_says_where_they_come_from() -> None:
    messages = build_messages(
        context(),
        [passage("Mietvertrag", "Frist drei Monate.", 4, 4, "§ 7"), passage("Bericht", "Zweiter Text.", 2, 3)],
    )
    system = messages[0].content
    assert "[1] (Dokument: Mietvertrag, Seite 4, Abschnitt: § 7)\nFrist drei Monate." in system
    assert "[2] (Dokument: Bericht, Seite 2-3)\nZweiter Text." in system
    assert NOT_FOUND in system


def test_prompt_without_passages_says_so() -> None:
    assert "Textstellen: (keine gefunden)" in build_messages(context(), [])[0].content


def test_prompt_keeps_the_history_in_order_and_ends_with_the_question() -> None:
    history = [Message("user", "Erste Frage"), Message("assistant", "Erste Antwort")]
    messages = build_messages(context(history, "Zweite Frage"), [passage()])
    assert [m.role for m in messages] == ["system", "user", "assistant", "user"]
    assert messages[-1].content == "Zweite Frage"


def test_citations_list_each_used_passage_once() -> None:
    passages = [passage("A", page_from=1, page_to=1), passage("B", section="Kapitel"), passage("C")]
    cites = citations_for("Erstens [2], zweitens [1], nochmal [2].", passages)
    assert [c["n"] for c in cites] == [1, 2]
    assert cites[1]["document_title"] == "B" and cites[1]["section_path"] == "Kapitel"
    assert cites[0]["chunk_id"] == str(passages[0].chunk_id) and cites[0]["page_from"] == 1


def test_citations_ignore_numbers_without_a_passage() -> None:
    assert citations_for("Nichts [0] oder [4] oder [99].", [passage(), passage()]) == []


def test_no_brackets_no_citations() -> None:
    assert citations_for("Antwort ohne Quellen.", [passage()]) == []
    assert citations_for(NOT_FOUND, [passage()]) == []
