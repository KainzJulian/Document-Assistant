"""The fake provider that the other tests rely on: it must behave the same way every time."""

import asyncio
import math

from app.providers.base import Message
from app.providers.fake import EMBED_DIMS, NOT_FOUND, FakeProvider, embed_text
from app.services import answering
from app.services.summarising import _SYSTEM as SUMMARY_SYSTEM


def say(*messages: Message) -> str:
    """The text the fake provider streams for a prompt."""
    return asyncio.run(FakeProvider().complete("fake-chat", list(messages))).text


def cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity of two vectors."""
    return sum(x * y for x, y in zip(a, b, strict=True))


def test_embeddings_are_repeatable_normalised_and_sixteen_long() -> None:
    vector = embed_text("Der Mieter kann kündigen")
    assert vector == embed_text("Der Mieter kann kündigen") and len(vector) == EMBED_DIMS
    assert math.isclose(math.sqrt(sum(v * v for v in vector)), 1.0)
    assert embed_text("") == [0.0] * EMBED_DIMS


def test_texts_with_shared_words_are_closer_than_unrelated_ones() -> None:
    query = embed_text("Kündigung Frist Mieter")
    assert cosine(query, embed_text("Frist der Kündigung durch den Mieter")) > cosine(query, embed_text("Rezept Kartoffelsuppe Zwiebel Sahne"))


def test_embed_returns_one_vector_per_text() -> None:
    vectors = asyncio.run(FakeProvider().embed("fake-embed", ["a", "b", "c"]))
    assert len(vectors) == 3


def test_not_found_sentence_is_the_one_the_chat_uses() -> None:
    assert NOT_FOUND == answering.NOT_FOUND


def test_answer_quotes_the_first_passage_with_a_citation() -> None:
    system = "Regeln\n\nTextstellen:\n\n[1] (Dokument: Mietvertrag)\nDie Frist beträgt drei Monate zum Monatsletzten."
    answer = say(Message("system", system), Message("user", "Welche Frist gilt?"))
    assert answer.startswith("Laut den Unterlagen") and "[1]" in answer and "drei Monate" in answer


def test_answer_is_the_fixed_sentence_without_passages_or_for_off_topic_questions() -> None:
    assert say(Message("system", "Textstellen: (keine gefunden)"), Message("user", "Frist?")) == NOT_FOUND
    system = "Textstellen:\n\n[1] (Dokument: X)\nText"
    assert say(Message("system", system), Message("user", "Hauptstadt von Frankreich?")) == NOT_FOUND


def test_summary_has_exactly_the_requested_number_of_words() -> None:
    system = SUMMARY_SYSTEM.format(n=150, lang="Schreibe in der Sprache des Textes.")
    assert len(say(Message("system", system), Message("user", "Langer Text")).split()) == 150


def test_the_real_chat_prompts_trigger_the_title_and_rewrite_scripts() -> None:
    assert say(Message("system", answering._TITLE), Message("user", "Frage: x\nAntwort: y")) == "Fragen zu den Unterlagen"
    rewritten = say(Message("system", answering._REWRITE), Message("user", "Verlauf:\nNutzer: a\n\nLetzte Frage: Und danach?"))
    assert rewritten == "Und danach?"


def test_stream_ends_with_the_token_usage() -> None:
    async def collect() -> list[bool]:
        return [d.usage is not None async for d in FakeProvider().stream_chat("m", [Message("user", "x")])]

    flags = asyncio.run(collect())
    assert flags[-1] is True and not any(flags[:-1])


def test_model_info_has_fake_sizes_and_unknown_models_count_as_eight_billion() -> None:
    info = asyncio.run(FakeProvider().model_info("qwen2.5:32b"))
    assert info.params_b == 32.0 and info.file_gb == 19.9
    assert asyncio.run(FakeProvider().model_info("fake-chat")).params_b == 8.0
