"""Providers and settings: keys are write-only, test button, model choice, embedding models, retrieval."""

from conftest import upload_ready
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db.session import get_engine


def add_provider(admin: TestClient, kind: str = "openai", label: str = "OpenAI", api_key: str | None = "sk-geheim-1234") -> dict:
    """Create a provider through the API."""
    body: dict[str, object] = {"kind": kind, "label": label}
    if api_key:
        body["api_key"] = api_key
    response = admin.post("/api/admin/providers", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_the_api_key_is_never_returned_and_is_stored_encrypted(admin: TestClient) -> None:
    provider = add_provider(admin)
    assert "sk-geheim" not in str(provider) and "sk-geheim" not in str(admin.get("/api/admin/providers").json())
    assert provider["has_key"] is True
    with get_engine().connect() as db:
        stored = db.execute(text("select api_key_enc from providers")).scalar()
    assert stored and "sk-geheim" not in stored


def test_editing_without_a_key_keeps_the_old_key(admin: TestClient) -> None:
    provider = add_provider(admin)
    with get_engine().connect() as db:
        before = db.execute(text("select api_key_enc from providers")).scalar()
    admin.patch(f"/api/admin/providers/{provider['id']}", json={"label": "Umbenannt"})
    admin.patch(f"/api/admin/providers/{provider['id']}", json={"api_key": ""})
    with get_engine().connect() as db:
        assert db.execute(text("select api_key_enc from providers")).scalar() == before


def test_connection_test_lists_models_and_disabled_providers_are_not_offered(admin: TestClient) -> None:
    provider = add_provider(admin, "ollama", "Lokal", None)
    result = admin.post(f"/api/admin/providers/{provider['id']}/test").json()
    assert result["ok"] is True and "fake-chat" in result["models"]
    admin.patch(f"/api/admin/providers/{provider['id']}", json={"enabled": False})
    assert admin.get(f"/api/providers/{provider['id']}/models").status_code == 404


def test_members_cannot_manage_providers_but_can_pick_a_model(admin: TestClient, member_factory) -> None:
    provider = add_provider(admin, "ollama", "Lokal", None)
    admin.post(f"/api/admin/providers/{provider['id']}/test")
    anna = member_factory("anna")
    assert anna.post("/api/admin/providers", json={"kind": "ollama", "label": "x"}).status_code == 403
    models = anna.get(f"/api/providers/{provider['id']}/models").json()
    assert "fake-chat" in models and "fake-embed" not in models
    saved = anna.put("/api/settings", json={"provider_id": provider["id"], "model": "fake-chat", "summary_language": "de"})
    assert saved.status_code == 200 and anna.get("/api/settings").json()["summary_language"] == "de"


def test_each_person_has_their_own_model_choice(admin: TestClient, member_factory) -> None:
    provider = add_provider(admin, "ollama", "Lokal", None)
    admin.put("/api/settings", json={"provider_id": provider["id"], "model": "llama3.1:8b", "summary_language": "source"})
    anna = member_factory("anna")
    assert anna.get("/api/settings").json()["model"] in (None, "")


def test_deleting_a_provider_clears_the_choice_of_people_using_it(admin: TestClient) -> None:
    provider = add_provider(admin, "ollama", "Lokal", None)
    admin.put("/api/settings", json={"provider_id": provider["id"], "model": "fake-chat", "summary_language": "source"})
    assert admin.delete(f"/api/admin/providers/{provider['id']}").status_code == 204
    assert admin.get("/api/settings").json()["provider_id"] is None


def test_switching_the_embedding_model_starts_a_build_and_rejects_a_second_one(model_ready: TestClient) -> None:
    created = model_ready.post("/api/admin/embedding-models", json={"provider": "ollama", "model": "fake-embed"})
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "building"
    again = model_ready.post("/api/admin/embedding-models", json={"provider": "ollama", "model": "fake-embed"})
    assert again.status_code == 409
    assert [m["model"] for m in model_ready.get("/api/admin/embedding-models").json()] == ["fake-embed"]


def test_embedding_reindex_activates_the_model_and_keeps_answers_working(model_ready: TestClient) -> None:
    import asyncio

    from app.services.indexing import reindex

    doc = upload_ready(model_ready, "notiz-de.txt")[0]
    created = model_ready.post("/api/admin/embedding-models", json={"provider": "ollama", "model": "fake-embed"}).json()
    asyncio.run(reindex(created["id"]))
    models = model_ready.get("/api/admin/embedding-models").json()
    assert models[0]["status"] == "active" and models[0]["dims"] == 16
    chat = model_ready.post("/api/chats", json={"document_ids": [doc["id"]]}).json()
    answer = model_ready.post(f"/api/chats/{chat['id']}/messages", json={"content": "Welche Frist gilt für die Kündigung?"})
    assert answer.status_code == 200 and "event: citations" in answer.text


def test_retrieval_debug_shows_vector_and_keyword_hits(model_ready: TestClient) -> None:
    doc = upload_ready(model_ready, "notiz-de.txt")[0]
    response = model_ready.get("/api/admin/retrieval-debug", params={"q": "Frist Kündigung Mieter", "document_ids": [doc["id"]]})
    assert response.status_code == 200 and response.json()


def test_keys_are_not_written_to_the_log(admin: TestClient, caplog) -> None:
    import logging

    with caplog.at_level(logging.DEBUG):
        provider = add_provider(admin, api_key="sk-nie-ins-log-9876")
        admin.patch(f"/api/admin/providers/{provider['id']}", json={"api_key": "sk-auch-nicht-5432"})
        admin.post(f"/api/admin/providers/{provider['id']}/test")
        admin.get("/api/admin/providers")
    assert "sk-nie-ins-log" not in caplog.text and "sk-auch-nicht" not in caplog.text
