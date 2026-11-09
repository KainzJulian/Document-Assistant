"""Shared test setup: environment, disposable database, logged-in clients, sample files.

Start the database with `make test-db` first (docker-compose.test.yml). The tests use the deterministic
fake provider, so no network, keys or Ollama are needed.
"""

import os
import shutil
import tempfile
import uuid
from collections.abc import Iterator
from pathlib import Path

# The environment must be set before the app is imported (settings are read at import time).
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@127.0.0.1:55432/test")
os.environ["FAKE_PROVIDERS"] = "1"
os.environ["FERNET_KEY"] = "kJ0tYB1xKq7mV3m1R2yQ0m5mZkq5w3lS9nq8X2sVt1A="
_FILES = tempfile.mkdtemp(prefix="docassistant-files-")
os.environ["FILES_DIR"] = _FILES
_HW = Path(tempfile.mkdtemp(prefix="docassistant-hw-")) / "hardware.json"
_HW.write_text('{"ram_total_gb": 16, "ram_free_gb": 11.2, "gpu": null}', encoding="utf-8")
os.environ["HARDWARE_JSON"] = str(_HW)

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db.session import get_engine  # noqa: E402
from app.main import app  # noqa: E402
from app.security import hash_password  # noqa: E402

SAMPLES = Path(__file__).resolve().parents[1] / "eval" / "extraction" / "samples"
ADMIN = ("admin", "Admin-Passw0rd-1")


@pytest.fixture(scope="session", autouse=True)
def database() -> Iterator[None]:
    """Create the schema once per test session (migrations up to head)."""
    api_dir = Path(__file__).resolve().parents[1]
    config = Config(str(api_dir / "alembic.ini"))
    config.set_main_option("script_location", str(api_dir / "migrations"))
    with get_engine().begin() as db:
        db.execute(text("drop schema public cascade; create schema public"))
    command.upgrade(config, "head")
    yield
    shutil.rmtree(_FILES, ignore_errors=True)


@pytest.fixture(scope="session", autouse=True)
def queue() -> Iterator[None]:
    """Use Procrastinate's in-memory queue: jobs are recorded, not run (tests run the job code directly)."""
    from procrastinate.testing import InMemoryConnector

    from app.jobs.app import procrastinate_app

    with procrastinate_app.replace_connector(InMemoryConnector()):
        yield


@pytest.fixture(autouse=True)
def clean() -> Iterator[None]:
    """Empty all data tables before every test (the schema and the job queue tables stay)."""
    with get_engine().begin() as db:
        db.execute(
            text(
                "truncate users, providers, embedding_models, chunk_embeddings, chunks, documents, chats, "
                "messages, summaries, user_settings, ollama_acknowledgements restart identity cascade"
            )
        )
    shutil.rmtree(_FILES, ignore_errors=True)
    os.makedirs(_FILES, exist_ok=True)
    yield


def make_user(username: str, password: str, role: str = "member") -> uuid.UUID:
    """Insert a user directly (faster than the API)."""
    uid = uuid.uuid4()
    with get_engine().begin() as db:
        db.execute(
            text("insert into users (id, username, display_name, password_hash, role) values (:i, :u, :d, :h, :r)"),
            {"i": uid, "u": username, "d": username, "h": hash_password(password), "r": role},
        )
    return uid


def login(client: TestClient, username: str, password: str) -> TestClient:
    """Log a client in (sets the session cookie and the CSRF header)."""
    client.headers["X-Requested-With"] = "app"
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return client


@pytest.fixture
def anon() -> Iterator[TestClient]:
    """A client without a session."""
    with TestClient(app) as client:
        client.headers["X-Requested-With"] = "app"
        yield client


@pytest.fixture
def admin(anon: TestClient) -> TestClient:
    """A client logged in as an admin."""
    make_user(*ADMIN, role="admin")
    return login(anon, *ADMIN)


@pytest.fixture
def member_factory():
    """Create a member and return a logged-in client for them."""
    clients: list[TestClient] = []

    def create(name: str) -> TestClient:
        make_user(name, f"{name}-Passw0rd-1")
        client = TestClient(app)
        client.__enter__()
        clients.append(client)
        return login(client, name, f"{name}-Passw0rd-1")

    yield create
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def model_ready(admin: TestClient) -> TestClient:
    """The admin has a fake provider, a chat model chosen and an active embedding model."""
    provider = admin.post("/api/admin/providers", json={"kind": "ollama", "label": "Fake"}).json()
    assert admin.post(f"/api/admin/providers/{provider['id']}/test").json()["ok"]
    assert admin.put("/api/settings", json={"provider_id": provider["id"], "model": "fake-chat", "summary_language": "source"}).status_code == 200
    return admin


def upload(client: TestClient, *names: str) -> list[dict]:
    """Upload sample files and return the API results."""
    files = [("files", (n, (SAMPLES / n).read_bytes(), "application/octet-stream")) for n in names]
    response = client.post("/api/documents/upload", files=files)
    assert response.status_code == 200, response.text
    return response.json()


def process(document_id: str) -> None:
    """Run extraction and indexing the way the worker would, synchronously."""
    import asyncio

    from app.services.indexing import index_document
    from app.services.ingestion import run_extraction

    doc_id = uuid.UUID(document_id)
    if run_extraction(doc_id):
        asyncio.run(index_document(doc_id))


def text_ready(client: TestClient, title: str, word_count: int) -> dict:
    """Store pasted text of the given length (distinct words, paragraphs of 100) and process it."""
    words = [f"wort{i}" for i in range(word_count)]
    text = "\n\n".join(" ".join(words[i : i + 100]) for i in range(0, word_count, 100))
    response = client.post("/api/documents/text", json={"title": title, "text": text})
    assert response.status_code == 201, response.text
    document_id = response.json()["document"]["id"]
    process(document_id)
    return client.get(f"/api/documents/{document_id}").json()


def upload_ready(client: TestClient, *names: str) -> list[dict]:
    """Upload sample files, process them and return the documents (status ready)."""
    docs = []
    for result in upload(client, *names):
        process(result["document"]["id"])
        docs.append(client.get(f"/api/documents/{result['document']['id']}").json())
    assert all(d["status"] == "ready" for d in docs), [d["error"] for d in docs]
    return docs
