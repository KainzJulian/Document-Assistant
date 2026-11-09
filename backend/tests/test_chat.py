"""Chat: streamed cited answers, not-found sentence, follow-ups, titles, regenerate, search, errors."""

import json

from conftest import upload_ready
from fastapi.testclient import TestClient

from app.providers.fake import NOT_FOUND

QUESTION = "Welche Frist gilt für die Kündigung des Mieters?"


def events(response_text: str) -> list[tuple[str, object]]:
    """Parse a Server-Sent Events body into (name, data) pairs."""
    result: list[tuple[str, object]] = []
    for block in response_text.strip().split("\n\n"):
        name, _, data = block.partition("\ndata: ")
        result.append((name.removeprefix("event: "), json.loads(data)))
    return result


def start_chat(client: TestClient, *names: str) -> str:
    """Upload documents and open a chat about them."""
    docs = upload_ready(client, *names)
    response = client.post("/api/chats", json={"document_ids": [d["id"] for d in docs]})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def ask(client: TestClient, chat_id: str, text: str) -> list[tuple[str, object]]:
    """Send a question and return the streamed events."""
    response = client.post(f"/api/chats/{chat_id}/messages", json={"content": text})
    assert response.status_code == 200, response.text
    return events(response.text)


def test_answer_streams_tokens_then_citations_done_and_title(model_ready: TestClient) -> None:
    chat_id = start_chat(model_ready, "notiz-de.txt")
    result = ask(model_ready, chat_id, QUESTION)
    names = [n for n, _ in result]
    assert names[0] == "token" and names[-3:] == ["citations", "done", "title"]
    citations = next(d for n, d in result if n == "citations")
    assert citations and citations[0]["n"] == 1 and citations[0]["document_title"]
    saved = model_ready.get(f"/api/chats/{chat_id}").json()
    assert [m["role"] for m in saved["messages"]] == ["user", "assistant"]
    assert saved["messages"][1]["citations"] and not saved["messages"][1]["interrupted"]
    assert saved["title"] == "Fragen zu den Unterlagen"


def test_citation_resolves_to_the_passage(model_ready: TestClient) -> None:
    chat_id = start_chat(model_ready, "notiz-de.txt")
    citation = next(d for n, d in ask(model_ready, chat_id, QUESTION) if n == "citations")[0]
    chunk = model_ready.get(f"/api/chunks/{citation['chunk_id']}").json()
    assert "Mietverhältnis" in chunk["text"]


def test_question_outside_the_documents_gets_the_fixed_sentence(model_ready: TestClient) -> None:
    chat_id = start_chat(model_ready, "notiz-de.txt")
    result = ask(model_ready, chat_id, "Wie heißt die Hauptstadt von Frankreich?")
    text = "".join(d["text"] for n, d in result if n == "token")
    assert text == NOT_FOUND
    assert next(d for n, d in result if n == "citations") == []


def test_follow_up_is_rewritten_and_title_is_set_only_once(model_ready: TestClient) -> None:
    chat_id = start_chat(model_ready, "notiz-de.txt")
    ask(model_ready, chat_id, QUESTION)
    second = ask(model_ready, chat_id, "Und wann muss das Schreiben beim Vermieter ankommen?")
    assert "title" not in [n for n, _ in second]
    assert len(model_ready.get(f"/api/chats/{chat_id}").json()["messages"]) == 4


def test_regenerate_replaces_only_the_last_answer(model_ready: TestClient) -> None:
    chat_id = start_chat(model_ready, "notiz-de.txt")
    ask(model_ready, chat_id, QUESTION)
    last = model_ready.get(f"/api/chats/{chat_id}").json()["messages"][-1]
    response = model_ready.post(f"/api/chats/{chat_id}/messages/{last['id']}/regenerate")
    assert response.status_code == 200 and events(response.text)[0][0] == "token"
    messages = model_ready.get(f"/api/chats/{chat_id}").json()["messages"]
    assert len(messages) == 2 and messages[-1]["id"] != last["id"]
    stale = model_ready.post(f"/api/chats/{chat_id}/messages/{messages[0]['id']}/regenerate")
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "not_last_answer"


def test_no_model_chosen_is_a_clear_error(admin: TestClient) -> None:
    chat_id = start_chat(admin, "notiz-de.txt")
    response = admin.post(f"/api/chats/{chat_id}/messages", json={"content": QUESTION})
    assert response.status_code == 422 and response.json()["error"]["code"] == "no_model"


def test_empty_question_and_unready_documents_are_rejected(model_ready: TestClient) -> None:
    chat_id = start_chat(model_ready, "notiz-de.txt")
    assert model_ready.post(f"/api/chats/{chat_id}/messages", json={"content": "   "}).status_code == 422
    assert model_ready.post("/api/chats", json={"document_ids": []}).status_code == 422


def test_changing_the_selected_documents(model_ready: TestClient) -> None:
    first = upload_ready(model_ready, "notiz-de.txt")[0]
    second = upload_ready(model_ready, "readme-de.md")[0]
    chat = model_ready.post("/api/chats", json={"document_ids": [first["id"]]}).json()
    patched = model_ready.patch(f"/api/chats/{chat['id']}", json={"document_ids": [first["id"], second["id"]]}).json()
    assert {d["id"] for d in patched["documents"]} == {first["id"], second["id"]}


def test_rename_search_and_delete(model_ready: TestClient) -> None:
    chat_id = start_chat(model_ready, "notiz-de.txt")
    ask(model_ready, chat_id, QUESTION)
    model_ready.patch(f"/api/chats/{chat_id}", json={"title": "Mietvertrag Kündigung"})
    assert len(model_ready.get("/api/chats", params={"q": "Kuendigung"}).json()) == 1
    assert len(model_ready.get("/api/chats", params={"q": "Mietvertag"}).json()) == 1
    assert model_ready.get("/api/chats", params={"q": "Fußballergebnis"}).json() == []
    assert model_ready.delete(f"/api/chats/{chat_id}").status_code == 204
    assert model_ready.get(f"/api/chats/{chat_id}").status_code == 404


def test_deleting_a_document_keeps_the_chat_readable(model_ready: TestClient) -> None:
    docs = upload_ready(model_ready, "notiz-de.txt")
    chat = model_ready.post("/api/chats", json={"document_ids": [docs[0]["id"]]}).json()
    ask(model_ready, chat["id"], QUESTION)
    assert model_ready.delete(f"/api/documents/{docs[0]['id']}").status_code == 204
    assert model_ready.get(f"/api/chats/{chat['id']}").status_code == 200


def test_answers_only_use_the_chosen_documents(model_ready: TestClient) -> None:
    rent = upload_ready(model_ready, "notiz-de.txt")[0]
    other = upload_ready(model_ready, "garantie.docx")[0]
    only_other = model_ready.get(
        "/api/admin/retrieval-debug", params={"q": "Kündigung Mieter Frist", "document_ids": [other["id"]]}
    ).json()
    assert all(p["document_id"] == other["id"] for p in only_other)
    chat = model_ready.post("/api/chats", json={"document_ids": [rent["id"]]}).json()
    citations = next(d for n, d in ask(model_ready, chat["id"], QUESTION) if n == "citations")
    assert citations and all(c["document_id"] == rent["id"] for c in citations)
