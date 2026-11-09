"""Deterministic fake provider for tests and for trying the app without API keys.

Switched on with ``FAKE_PROVIDERS=1``: every provider row then behaves like this adapter. It needs no
network, answers from the passages in the prompt, writes summaries of exactly the requested length,
and produces repeatable embeddings. ``FAKE_DELAY`` (seconds per streamed word) slows answers down so
interruption can be tested.
"""

import asyncio
import hashlib
import math
import os
import re
from collections.abc import AsyncIterator

from app.providers.base import BaseProvider, Delta, Message, Usage
from app.providers.ollama_provider import OllamaModelInfo

NOT_FOUND = "Dazu finde ich in den ausgewählten Dokumenten nichts."
MODELS = ["fake-chat", "fake-embed", "llama3.1:8b", "qwen2.5:14b", "qwen2.5:32b"]
# file GB, parameters in billions, for the hardware check
OLLAMA_SIZES = {"llama3.1:8b": (4.9, 8.0), "qwen2.5:14b": (9.0, 14.0), "qwen2.5:32b": (19.9, 32.0)}
EMBED_DIMS = 16


def embed_text(text: str) -> list[float]:
    """Hash words into a normalised vector, so texts with shared words are close."""
    vector = [0.0] * EMBED_DIMS
    for word in re.findall(r"\w+", text.lower()):
        h = int(hashlib.md5(word.encode()).hexdigest(), 16)
        vector[h % EMBED_DIMS] += 1.0
    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / norm for v in vector]


class FakeProvider(BaseProvider):
    """Scripted answers and summaries, hashed embeddings."""

    kind = "fake"

    def __init__(self, delay: float | None = None) -> None:
        """Create the provider.

        Args:
            delay: Seconds to wait per streamed word; defaults to ``FAKE_DELAY`` or 0.
        """
        self._delay = float(os.environ.get("FAKE_DELAY", "0")) if delay is None else delay

    def _script(self, messages: list[Message]) -> str:
        """Decide the answer from the prompt."""
        system = next((m.content for m in messages if m.role == "system"), "")
        user = messages[-1].content if messages else ""
        if "höchstens sechs Wörter" in system:
            return "Fragen zu den Unterlagen"
        if "ohne den Gesprächsverlauf verständlich" in system:
            return user.rsplit("Letzte Frage:", 1)[-1].strip()
        match = re.search(r"etwa (\d+) Wörter", system)
        if match and ("Teilzusammenfassungen" in system or "Du fasst Texte zusammen" in system or "Wörter lang sein" in system):
            return " ".join(["Zusammenfassung"] * int(match.group(1)))
        if "Textstellen:" in system:
            if "(keine gefunden)" in system or "Frankreich" in user or "nichts_zu_finden" in user:
                return NOT_FOUND
            passage = re.search(r"\[1\] \([^)]*\)\n(.+)", system)
            snippet = " ".join(passage.group(1).split()[:14]) if passage else ""
            return f"Laut den Unterlagen gilt Folgendes [1]: {snippet} ... [1]"
        return "Fake-Antwort."

    async def stream_chat(
        self, model: str, messages: list[Message], max_tokens: int | None = None
    ) -> AsyncIterator[Delta]:
        """Stream the scripted answer word by word, then the token usage.

        Args:
            model: Ignored.
            messages: The prompt.
            max_tokens: Ignored.

        Yields:
            Words, then the usage.
        """
        text = self._script(messages)
        words = text.split(" ")
        for i, word in enumerate(words):
            yield Delta(text=word + ("" if i == len(words) - 1 else " "))
            if self._delay:
                await asyncio.sleep(self._delay)
        yield Delta(usage=Usage(sum(len(m.content.split()) for m in messages), len(words)), eval_seconds=max(len(words) / 4, 0.1))

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        """Return hashed bag-of-words vectors (16 dimensions)."""
        return [embed_text(t) for t in texts]

    async def list_models(self) -> list[str]:
        """Return the fake model names."""
        return list(MODELS)

    async def model_info(self, model: str) -> OllamaModelInfo:
        """Return fake sizes for the hardware check (unknown names count as an 8B model)."""
        file_gb, params = OLLAMA_SIZES.get(model, (4.9, 8.0))
        return OllamaModelInfo(file_gb, params, "Q4_K_M", 8192)
