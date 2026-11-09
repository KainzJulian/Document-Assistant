"""Shared helpers for the evaluation scripts (run inside the api container).

    docker cp eval doc-assistant-api-1:/tmp/eval
    docker exec -e JUDGE_PROVIDER="Anthropic" -e JUDGE_MODEL="<strong model>" doc-assistant-api-1 python /tmp/eval/run_summaries.py

Environment: EVAL_USER and EVAL_PASSWORD (default julian / Test-Passw0rd-1), JUDGE_PROVIDER (the label of
a configured provider, see the settings page) and JUDGE_MODEL (your strongest model).
The user's own model setting decides which model is evaluated; the judge model is separate.
"""

import asyncio
import json
import os
import re
import time
from datetime import date
from pathlib import Path

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Provider
from app.db.session import get_engine
from app.providers.base import Message
from app.providers.registry import build_provider

BASE = os.environ.get("EVAL_BASE", "http://proxy/api")
USER = os.environ.get("EVAL_USER", "julian")
PASSWORD = os.environ.get("EVAL_PASSWORD", "Test-Passw0rd-1")
NOT_FOUND = "Dazu finde ich in den ausgewählten Dokumenten nichts."
OUT = Path(os.environ.get("EVAL_OUT", "/tmp/eval/out"))


def client() -> httpx.Client:
    """Log in and return a client with the session cookie."""
    c = httpx.Client(base_url=BASE, headers={"X-Requested-With": "app"}, timeout=900)
    assert c.post("/auth/login", json={"username": USER, "password": PASSWORD}).status_code == 200, "login failed"
    return c


def sse(c: httpx.Client, path: str, body: dict | None = None) -> list[tuple[str, object]]:
    """POST and collect all Server-Sent Events as (name, data)."""
    events: list[tuple[str, object]] = []
    with c.stream("POST", path, json=body) as r:
        if r.status_code != 200:
            r.read()
            raise RuntimeError(f"{path}: {r.status_code} {r.text[:200]}")
        name = ""
        for line in r.iter_lines():
            if line.startswith("event:"):
                name = line[6:].strip()
            elif line.startswith("data:"):
                events.append((name, json.loads(line[5:])))
    return events


def judge(system: str, user: str) -> dict:
    """Ask the judge model a question and parse its JSON answer.

    Args:
        system: Instruction (answer with JSON only).
        user: The material to judge.

    Returns:
        The parsed JSON object.
    """
    label, model = os.environ["JUDGE_PROVIDER"], os.environ["JUDGE_MODEL"]
    with Session(get_engine()) as db:
        row = db.scalar(select(Provider).where(Provider.label == label))
        assert row is not None, f"no provider labelled {label!r}"
        provider = build_provider(row)
    text = asyncio.run(provider.complete(model, [Message("system", system), Message("user", user)], max_tokens=2000)).text
    match = re.search(r"\{.*\}", text, re.DOTALL)
    return json.loads(match.group(0)) if match else {}


def ensure_documents(c: httpx.Client, files: list[Path]) -> dict[str, dict]:
    """Upload files that are not in the library yet and wait until all are ready.

    Returns:
        A map from file name to the document.
    """
    have = {d["filename"]: d for d in c.get("/documents").json() if d["filename"]}
    for f in files:
        if f.name not in have:
            c.post("/documents/upload", files=[("files", (f.name, f.read_bytes(), "application/octet-stream"))])
    deadline = time.time() + 1800
    while time.time() < deadline:
        docs = {d["filename"]: d for d in c.get("/documents").json() if d["filename"]}
        if all(f.name in docs and docs[f.name]["status"] in ("ready", "failed") for f in files):
            return docs
        time.sleep(2)
    raise RuntimeError("documents did not become ready in 30 minutes")


def write_report(name: str, markdown: str) -> Path:
    """Write a dated Markdown report next to the script output.

    Copy it to docs/eval/ afterwards: `docker cp doc-assistant-api-1:/tmp/eval/out docs/eval-out`.
    """
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}-{date.today().isoformat()}.md"
    path.write_text(markdown, encoding="utf-8")
    return path
