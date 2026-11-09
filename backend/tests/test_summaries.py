"""Summaries: five lengths, cap for short sources, replacement, languages, errors."""

import json

from conftest import text_ready, upload_ready
from fastapi.testclient import TestClient


def create(client: TestClient, doc_id: str, length: str, language: str = "source") -> list[tuple[str, object]]:
    """Request a summary and return the streamed events."""
    response = client.post(f"/api/documents/{doc_id}/summaries", json={"length": length, "language": language})
    assert response.status_code == 200, response.text
    result = []
    for block in response.text.strip().split("\n\n"):
        name, _, data = block.partition("\ndata: ")
        result.append((name.removeprefix("event: "), json.loads(data)))
    return result


def saved(events: list[tuple[str, object]]) -> dict:
    """The summary from the final ``done`` event."""
    return next(d for n, d in events if n == "done")


def test_long_document_gets_the_exact_nominal_length(model_ready: TestClient) -> None:
    doc = text_ready(model_ready, "Langer Text", 4000)
    for length, target in {"xs": 50, "s": 150, "m": 300, "l": 600, "xl": 1200}.items():
        summary = saved(create(model_ready, doc["id"], length))
        assert summary["word_count"] == target and summary["note"] is None


def test_short_document_caps_the_target_and_says_so(model_ready: TestClient) -> None:
    doc = upload_ready(model_ready, "notiz-de.txt")[0]
    summary = saved(create(model_ready, doc["id"], "xl"))
    assert summary["target_words"] == doc["word_count"] // 3
    assert summary["nominal_words"] == 1200 and "begrenzt" in summary["note"]


def test_very_long_text_is_summarised_in_parts(model_ready: TestClient) -> None:
    doc = text_ready(model_ready, "Sehr langer Text", 20000)
    result = create(model_ready, doc["id"], "m")
    assert any(n == "progress" for n, _ in result)
    assert saved(result)["word_count"] == 300


def test_a_second_request_replaces_the_first(model_ready: TestClient) -> None:
    doc = text_ready(model_ready, "Text", 1500)
    create(model_ready, doc["id"], "s")
    create(model_ready, doc["id"], "s")
    create(model_ready, doc["id"], "m")
    listed = model_ready.get(f"/api/documents/{doc['id']}/summaries").json()
    assert [s["length"] for s in listed] == ["s", "m"]


def test_summary_records_the_model_that_wrote_it(model_ready: TestClient) -> None:
    doc = text_ready(model_ready, "Text", 1500)
    summary = saved(create(model_ready, doc["id"], "s"))
    assert summary["model"] == "fake-chat" and summary["provider"]


def test_summary_without_a_model_is_a_clear_error(admin: TestClient) -> None:
    doc = upload_ready(admin, "notiz-de.txt")[0]
    response = admin.post(f"/api/documents/{doc['id']}/summaries", json={"length": "s"})
    assert response.status_code == 422 and response.json()["error"]["code"] == "no_model"


def test_invalid_length_or_language_is_rejected(model_ready: TestClient) -> None:
    doc = upload_ready(model_ready, "notiz-de.txt")[0]
    assert model_ready.post(f"/api/documents/{doc['id']}/summaries", json={"length": "xxl"}).status_code == 422
    assert model_ready.post(f"/api/documents/{doc['id']}/summaries", json={"length": "s", "language": "fr"}).status_code == 422


def test_unready_document_cannot_be_summarised(model_ready: TestClient) -> None:
    from conftest import upload

    doc = upload(model_ready, "notiz-de.txt")[0]["document"]
    response = model_ready.post(f"/api/documents/{doc['id']}/summaries", json={"length": "s"})
    assert response.status_code == 409 and response.json()["error"]["code"] == "not_ready"
