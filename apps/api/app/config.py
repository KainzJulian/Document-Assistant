"""Runtime settings read from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings.

    Attributes:
        database_url: SQLAlchemy URL, e.g. ``postgresql+psycopg://user:pw@db:5432/app``.
        fernet_key: Key that encrypts provider API keys at rest.
        session_days: Sliding lifetime of a login session in days.
        ollama_url: Base URL of the Ollama server.
        files_dir: Directory of the ``files`` volume (original uploads).
        hardware_json: GPU facts written by ``infra/scripts/detect-gpu.sh`` (mounted read-only).
        memory_bandwidth_gb_s: Memory bandwidth used for the CPU speed estimate.
        ollama_context: Context size Ollama models are assumed to run with.
        fake_providers: Use the deterministic fake provider everywhere (tests, trying the app without keys).
        allow_private_urls: Let the URL import reach private addresses (only for end-to-end tests).
    """

    database_url: str
    fernet_key: str = ""
    session_days: int = 30
    ollama_url: str = "http://ollama:11434"
    files_dir: str = "/data/files"
    hardware_json: str = "/data/hardware/hardware.json"
    memory_bandwidth_gb_s: float = 20.0
    ollama_context: int = 8192
    fake_providers: bool = False
    allow_private_urls: bool = False

    @property
    def conninfo(self) -> str:
        """Return the database URL in plain libpq form for Procrastinate."""
        return self.database_url.replace("+psycopg", "", 1)


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings instance."""
    return Settings()  # pyright: ignore[reportCallIssue]
