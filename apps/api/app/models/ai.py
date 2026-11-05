"""Pydantic models for providers, settings and the Ollama hardware check."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ProviderKind = Literal["anthropic", "openai", "google", "ollama"]
Verdict = Literal["fits", "partial", "cpu_only", "too_big"]
_strict = ConfigDict(strict=True, extra="forbid")


class ProviderOut(BaseModel):
    """A provider as the admin sees it. The key itself is never returned."""

    id: int
    kind: str
    label: str
    base_url: str | None
    enabled: bool
    has_key: bool
    models: list[str]


class ProviderCreate(BaseModel):
    """Body of ``POST /admin/providers``."""

    model_config = _strict

    kind: ProviderKind
    label: str = Field(min_length=1, max_length=60)
    base_url: str | None = Field(default=None, max_length=300)
    api_key: str | None = Field(default=None, max_length=500)


class ProviderPatch(BaseModel):
    """Body of ``PATCH /admin/providers/{id}``; an empty or missing key keeps the stored one."""

    model_config = _strict

    label: str | None = Field(default=None, min_length=1, max_length=60)
    base_url: str | None = Field(default=None, max_length=300)
    api_key: str | None = Field(default=None, max_length=500)
    enabled: bool | None = None


class ProviderTestOut(BaseModel):
    """Result of "Verbindung testen"."""

    ok: bool
    message: str
    models: list[str]


class ProviderChoice(BaseModel):
    """A provider a person can pick a model from."""

    id: int
    kind: str
    label: str
    local: bool
    models: list[str]


class SettingsOut(BaseModel):
    """A person's settings plus what they can choose from."""

    provider_id: int | None
    model: str | None
    summary_language: str
    providers: list[ProviderChoice]


class SettingsIn(BaseModel):
    """Body of ``PUT /settings``."""

    model_config = _strict

    provider_id: int | None
    model: str | None = Field(max_length=200)
    summary_language: Literal["source", "de"]


class AccountPatch(BaseModel):
    """Body of ``PATCH /auth/me``: change the display name and/or the password."""

    model_config = _strict

    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    current_password: str | None = Field(default=None, max_length=256)
    new_password: str | None = Field(default=None, min_length=8, max_length=256)


class GpuOut(BaseModel):
    """GPU facts."""

    name: str
    vram_total_gb: float
    vram_free_gb: float


class OllamaFitOut(BaseModel):
    """Answer of ``GET /hardware/ollama-fit``."""

    model: str
    ram_total_gb: float
    ram_free_gb: float
    gpu: GpuOut | None
    need_gb: float
    verdict: Verdict
    est_words_per_s: float | None
    needs_warning: bool
    acknowledged: str | None


class BenchmarkIn(BaseModel):
    """Body of ``POST /hardware/ollama-benchmark``."""

    model_config = _strict

    model: str = Field(min_length=1, max_length=200)


class BenchmarkOut(BaseModel):
    """Measured generation speed."""

    words_per_s: float
    tokens: int
    seconds: float


class AckIn(BaseModel):
    """Body of ``POST /settings/ollama-ack``."""

    model_config = _strict

    model: str = Field(min_length=1, max_length=200)
    verdict: Verdict
