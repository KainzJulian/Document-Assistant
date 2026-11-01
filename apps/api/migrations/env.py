"""Alembic environment: online migrations against ``DATABASE_URL``."""

from alembic import context
from sqlalchemy import create_engine

from app.config import get_settings
from app.db.models import Base


def run_migrations_online() -> None:
    """Run migrations with a live connection."""
    engine = create_engine(get_settings().database_url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
