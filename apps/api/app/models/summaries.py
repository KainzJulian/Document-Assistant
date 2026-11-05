"""Pydantic models for summaries."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

Length = Literal["xs", "s", "m", "l", "xl"]


class SummaryOut(BaseModel):
    """A saved summary with the model that wrote it."""

    id: uuid.UUID
    length: str
    text: str
    word_count: int
    target_words: int
    nominal_words: int
    note: str | None
    provider: str
    model: str
    created_at: datetime


class SummaryRequest(BaseModel):
    """Body of ``POST /documents/{id}/summaries``."""

    model_config = ConfigDict(strict=True, extra="forbid")

    length: Length
    language: Literal["source", "de"] = "source"
