"""Procrastinate application shared by the api (enqueue) and the worker (run)."""

from procrastinate import App, PsycopgConnector

from app.config import get_settings

procrastinate_app = App(
    connector=PsycopgConnector(conninfo=get_settings().conninfo),
    import_paths=["app.jobs.noop", "app.jobs.extract", "app.jobs.reindex"],
)
