"""Unit tests need no database: switch off the session-wide database setup of ``tests/conftest.py``."""

from collections.abc import Iterator

import pytest


@pytest.fixture(scope="session", autouse=True)
def database() -> Iterator[None]:
    """Replace the schema setup (unit tests never touch the database)."""
    yield


@pytest.fixture(scope="session", autouse=True)
def queue() -> Iterator[None]:
    """Replace the job queue setup (unit tests never defer jobs)."""
    yield


@pytest.fixture(autouse=True)
def clean() -> Iterator[None]:
    """Replace the table cleanup (unit tests never write rows)."""
    yield
