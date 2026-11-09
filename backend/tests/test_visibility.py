"""One person can never read another's private data; shared documents are read-only for others."""

from conftest import upload_ready
from fastapi.testclient import TestClient


def test_private_documents_are_invisible_to_others(member_factory) -> None:
    anna, ben = member_factory("anna"), member_factory("ben")
    doc = upload_ready(anna, "notiz-de.txt")[0]
    assert ben.get(f"/api/documents/{doc['id']}").status_code == 404
    assert ben.get(f"/api/documents/{doc['id']}/text").status_code == 404
    assert ben.get(f"/api/documents/{doc['id']}/file").status_code == 404
    assert ben.get("/api/documents").json() == []


def test_shared_documents_are_readable_but_not_changeable(member_factory) -> None:
    anna, ben = member_factory("anna"), member_factory("ben")
    doc = upload_ready(anna, "notiz-de.txt")[0]
    anna.patch(f"/api/documents/{doc['id']}", json={"shared": True})
    listed = ben.get("/api/documents", params={"scope": "shared"}).json()
    assert [d["id"] for d in listed] == [doc["id"]] and listed[0]["mine"] is False
    assert ben.get(f"/api/documents/{doc['id']}/text").status_code == 200
    assert ben.get(f"/api/documents/{doc['id']}/file").status_code == 200
    assert ben.patch(f"/api/documents/{doc['id']}", json={"title": "x"}).status_code == 403
    assert ben.delete(f"/api/documents/{doc['id']}").status_code == 403
    assert ben.post(f"/api/documents/{doc['id']}/retry").status_code == 403
    anna.patch(f"/api/documents/{doc['id']}", json={"shared": False})
    assert ben.get(f"/api/documents/{doc['id']}").status_code == 404


def test_the_same_file_can_be_uploaded_by_two_people(member_factory) -> None:
    anna, ben = member_factory("anna"), member_factory("ben")
    a, b = upload_ready(anna, "notiz-de.txt")[0], upload_ready(ben, "notiz-de.txt")[0]
    assert a["id"] != b["id"]


def test_chats_are_private_even_with_shared_documents(model_ready: TestClient, member_factory) -> None:
    doc = upload_ready(model_ready, "notiz-de.txt")[0]
    model_ready.patch(f"/api/documents/{doc['id']}", json={"shared": True})
    chat = model_ready.post("/api/chats", json={"document_ids": [doc["id"]]}).json()
    ben = member_factory("ben")
    assert ben.get(f"/api/chats/{chat['id']}").status_code == 404
    assert ben.patch(f"/api/chats/{chat['id']}", json={"title": "x"}).status_code == 404
    assert ben.delete(f"/api/chats/{chat['id']}").status_code == 404
    assert ben.post(f"/api/chats/{chat['id']}/messages", json={"content": "hi"}).status_code == 404
    assert ben.get("/api/chats").json() == []


def test_chat_cannot_be_created_on_a_private_document_of_someone_else(member_factory) -> None:
    anna, ben = member_factory("anna"), member_factory("ben")
    doc = upload_ready(anna, "notiz-de.txt")[0]
    assert ben.post("/api/chats", json={"document_ids": [doc["id"]]}).status_code == 422


def test_chunks_follow_document_visibility(member_factory) -> None:
    from sqlalchemy import text

    from app.db.session import get_engine

    anna, ben = member_factory("anna"), member_factory("ben")
    doc = upload_ready(anna, "notiz-de.txt")[0]
    with get_engine().connect() as db:
        chunk_id = db.execute(text("select id from chunks where document_id = :d limit 1"), {"d": doc["id"]}).scalar()
    assert anna.get(f"/api/chunks/{chunk_id}").status_code == 200
    assert ben.get(f"/api/chunks/{chunk_id}").status_code == 404
    anna.patch(f"/api/documents/{doc['id']}", json={"shared": True})
    assert ben.get(f"/api/chunks/{chunk_id}").status_code == 200


def test_summaries_are_shared_with_the_document(model_ready: TestClient, member_factory) -> None:
    doc = upload_ready(model_ready, "report-en.pdf")[0]
    ben = member_factory("ben")
    assert ben.get(f"/api/documents/{doc['id']}/summaries").status_code == 404
    model_ready.post(f"/api/documents/{doc['id']}/summaries", json={"length": "s"})
    model_ready.patch(f"/api/documents/{doc['id']}", json={"shared": True})
    assert len(ben.get(f"/api/documents/{doc['id']}/summaries").json()) == 1


def test_provider_and_embedding_admin_endpoints_are_admin_only(member_factory) -> None:
    ben = member_factory("ben")
    assert ben.get("/api/admin/providers").status_code == 403
    assert ben.get("/api/admin/embedding-models").status_code == 403
    assert ben.get("/api/admin/retrieval-debug", params={"q": "x", "document_ids": ["00000000-0000-0000-0000-000000000000"]}).status_code == 403


def test_search_never_finds_other_peoples_chats(model_ready: TestClient, member_factory) -> None:
    doc = upload_ready(model_ready, "notiz-de.txt")[0]
    chat = model_ready.post("/api/chats", json={"document_ids": [doc["id"]]}).json()
    model_ready.patch(f"/api/chats/{chat['id']}", json={"title": "Geheimprojekt Nordlicht"})
    ben = member_factory("ben")
    assert ben.get("/api/chats", params={"q": "Nordlicht"}).json() == []
    assert len(model_ready.get("/api/chats", params={"q": "Nordlicht"}).json()) == 1
