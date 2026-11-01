"""No-op job that proves the worker and the Postgres queue work end to end."""

from app.jobs.app import procrastinate_app


@procrastinate_app.task(name="noop")
async def noop() -> str:
    """Do nothing and return ``"ok"``."""
    return "ok"
