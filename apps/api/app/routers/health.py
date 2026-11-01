"""``GET /api/health``: status of the database, worker, Ollama and providers."""

import asyncio

import httpx
from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_session

router = APIRouter(tags=["health"])

# NOTE: httpx timeouts do not cover DNS, and an unknown Docker service name can take
# seconds to fail, so the Ollama probe also gets a hard overall limit.
_OLLAMA_PROBE_SECONDS = 2.0


class Health(BaseModel):
    """Health report. Each flag is true when that part is reachable."""

    db: bool
    worker: bool
    ollama: bool
    providers: list[str]


def _db_and_worker(session: Session) -> tuple[bool, bool]:
    """Return (database reachable, a worker sent a heartbeat in the last 60 seconds)."""
    try:
        session.execute(text("SELECT 1"))
        row = session.execute(
            text(
                "SELECT 1 FROM procrastinate_workers "
                "WHERE last_heartbeat > now() - interval '60 seconds' LIMIT 1"
            )
        ).first()
    except Exception:
        return False, False
    return True, row is not None


async def _ollama_alive() -> bool:
    """Return true if the Ollama server answers within the time limit."""
    try:
        async with httpx.AsyncClient(timeout=_OLLAMA_PROBE_SECONDS) as client:
            response = await asyncio.wait_for(
                client.get(f"{get_settings().ollama_url}/api/tags"), _OLLAMA_PROBE_SECONDS
            )
        return response.is_success
    except (httpx.HTTPError, TimeoutError):
        return False


@router.get("/health")
async def health(session: Session = Depends(get_session)) -> Health:
    """Report the state of every dependency; never fails, so it works as a probe.

    Args:
        session: Database session.

    Returns:
        The health report.
    """
    db, worker = await run_in_threadpool(_db_and_worker, session)
    return Health(db=db, worker=worker, ollama=await _ollama_alive(), providers=[])
