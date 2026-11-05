"""Documents: upload outcomes, duplicates, extraction of every sample, text import, delete, list filters."""

import pytest
from fastapi.testclient import TestClient

from conftest import SAMPLES, process, upload, upload_ready, text_ready

ALL_SAMPLES = sorted(p.name for p in SAMPLES.glob("*") if p.suffix in {".pdf", ".docx", ".pptx", ".html", ".epub", ".txt", ".md"})


@pytest.mark.parametrize("name", ALL_SAMPLES)
def test_every_sample_is_extracted_and_indexed(member_factory, name: str) -> None:
    client = member_factory("anna")
    doc = upload_ready(client, name)[0]
    assert doc["status"] == "ready" and doc["word_count"] > 0 and doc["title"]


def test_upload_creates_a_document_that_is_processed_later(admin: TestClient) -> None:
    result = upload(admin, "notiz-de.txt")[0]
    assert result["outcome"] == "created" and result["document"]["status"] in ("queued", "extracting")
    process(result["document"]["id"])
    assert admin.get(f"/api/documents/{result['document']['id']}").json()["status"] == "ready"


def test_same_file_again_is_reported_as_duplicate(admin: TestClient) -> None:
    first = upload(admin, "notiz-de.txt")[0]
    second = upload(admin, "notiz-de.txt")[0]
    assert second["outcome"] == "duplicate" and second["document"]["id"] == first["document"]["id"]
    assert len(admin.get("/api/documents").json()) == 1


def test_one_bad_file_does_not_stop_the_others(admin: TestClient) -> None:
    files = [
        ("files", ("kaputt.exe", b"MZ\x00\x00" * 100, "application/octet-stream")),
        ("files", ("notiz-de.txt", (SAMPLES / "notiz-de.txt").read_bytes(), "text/plain")),
    ]
    results = admin.post("/api/documents/upload", files=files).json()
    assert [r["outcome"] for r in results] == ["rejected", "created"]
    assert results[0]["message"]


def test_type_is_detected_by_content_not_by_name(admin: TestClient) -> None:
    files = [("files", ("tarnung.pdf", b"nur ein Text", "application/pdf"))]
    assert admin.post("/api/documents/upload", files=files).json()[0]["outcome"] == "rejected"


def test_empty_file_is_rejected(admin: TestClient) -> None:
    files = [("files", ("leer.txt", b"", "text/plain"))]
    assert admin.post("/api/documents/upload", files=files).json()[0]["outcome"] == "rejected"


def test_pdf_without_text_fails_with_a_readable_message(admin: TestClient) -> None:
    # A valid but empty PDF page: nothing to extract, so the document ends as failed with a reason.
    import fitz

    pdf = fitz.open()
    pdf.new_page()
    files = [("files", ("scan.pdf", pdf.tobytes(), "application/pdf"))]
    doc = admin.post("/api/documents/upload", files=files).json()[0]["document"]
    process(doc["id"])
    final = admin.get(f"/api/documents/{doc['id']}").json()
    assert final["status"] == "failed" and final["error"]


def test_retry_after_failure_requeues(admin: TestClient) -> None:
    import fitz

    pdf = fitz.open()
    pdf.new_page()
    doc = admin.post("/api/documents/upload", files=[("files", ("scan.pdf", pdf.tobytes(), "application/pdf"))]).json()[0]["document"]
    process(doc["id"])
    assert admin.post(f"/api/documents/{doc['id']}/retry").json()["status"] in ("queued", "extracting")


def test_pasted_text_becomes_a_document_and_duplicates_are_detected(admin: TestClient) -> None:
    doc = text_ready(admin, "Meine Notiz", 150)
    assert doc["kind"] == "text" and doc["status"] == "ready"
    text = "\n\n".join(" ".join(f"wort{i}" for i in range(s, min(s + 100, 150))) for s in range(0, 150, 100))
    again = admin.post("/api/documents/text", json={"title": "Andere Überschrift", "text": text})
    assert again.json()["outcome"] == "duplicate"


def test_rename_and_share(admin: TestClient) -> None:
    doc = upload_ready(admin, "notiz-de.txt")[0]
    changed = admin.patch(f"/api/documents/{doc['id']}", json={"title": "Neuer Titel", "shared": True}).json()
    assert changed["title"] == "Neuer Titel" and changed["shared"] is True
    assert admin.patch(f"/api/documents/{doc['id']}", json={"title": ""}).status_code == 422


def test_list_filters(admin: TestClient) -> None:
    upload_ready(admin, "notiz-de.txt", "report-en.pdf")
    assert len(admin.get("/api/documents", params={"q": "Einkaufsliste"}).json()) == 1
    assert len(admin.get("/api/documents", params={"kind": "pdf"}).json()) == 1
    assert len(admin.get("/api/documents", params={"status": "ready"}).json()) == 2
    assert admin.get("/api/documents", params={"scope": "shared"}).json() == []


def test_delete_removes_file_text_chunks_and_summaries(model_ready: TestClient) -> None:
    from sqlalchemy import text

    from app.db.session import get_engine

    doc = upload_ready(model_ready, "notiz-de.txt")[0]
    model_ready.post(f"/api/documents/{doc['id']}/summaries", json={"length": "xs"})
    assert model_ready.delete(f"/api/documents/{doc['id']}").status_code == 204
    with get_engine().connect() as db:
        for table in ("chunks", "summaries", "document_texts"):
            assert db.execute(text(f"select count(*) from {table}")).scalar() == 0
    assert model_ready.get(f"/api/documents/{doc['id']}/file").status_code == 404


def test_original_file_is_downloadable_by_the_owner(admin: TestClient) -> None:
    doc = upload_ready(admin, "notiz-de.txt")[0]
    response = admin.get(f"/api/documents/{doc['id']}/file")
    assert response.status_code == 200 and response.content == (SAMPLES / "notiz-de.txt").read_bytes()


def test_extracted_text_has_page_markers_for_pdfs(admin: TestClient) -> None:
    doc = upload_ready(admin, "report-en.pdf")[0]
    assert "<!--page:1-->" in admin.get(f"/api/documents/{doc['id']}/text").json()["markdown"]
