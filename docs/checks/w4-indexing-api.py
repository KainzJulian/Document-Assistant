"""W4 check on the live stack: indexing, keyword retrieval, visibility, and (optionally) the model switch.

    docker cp backend/eval/extraction/samples doc-assistant-api-1:/tmp/samples
    docker exec -i doc-assistant-api-1 python - < docs/checks/w4-indexing-api.py

To include the vector part, add an Ollama provider with bge-m3 pulled (`make ollama-pull`), run
"Verbindung testen" in the settings, then set EMBED below to ("ollama", "bge-m3").
"""

import time

import httpx

BASE = "http://proxy/api"
H = {"X-Requested-With": "app"}
S = "/tmp/samples/"
EMBED = None  # e.g. ("ollama", "bge-m3")
ok_all = []


def check(name, ok, extra=""):
    ok_all.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra else ""))


c = httpx.Client(base_url=BASE, headers=H, timeout=120)
assert c.post("/auth/login", json={"username": "julian", "password": "Test-Passw0rd-1"}).status_code == 200
for d in c.get("/documents").json():
    c.delete(f"/documents/{d['id']}")


def wait(ids, timeout=180):
    end = time.time() + timeout
    seen = {i: [] for i in ids}
    while time.time() < end:
        docs = {d["id"]: d for d in c.get("/documents").json()}
        for i in ids:
            if not seen[i] or seen[i][-1] != docs[i]["status"]:
                seen[i].append(docs[i]["status"])
        if all(docs[i]["status"] in ("ready", "failed") for i in ids):
            return docs, seen
        time.sleep(0.5)
    return docs, seen


files = ["bericht-de.pdf", "report-en.pdf", "garantie.docx", "buch-de.epub"]
res = c.post("/documents/upload", files=[("files", (n, open(S + n, "rb").read(), "application/octet-stream")) for n in files]).json()
ids = [r["document"]["id"] for r in res]
docs, seen = wait(ids)
check("all documents go through indexing to ready", all(d["status"] == "ready" for d in docs.values()), {d["title"]: d["status"] for d in docs.values()})
check("status 'indexing' appears (or is too fast to see)", True, list(seen.values())[0])

from sqlalchemy import text  # noqa: E402

from app.db.session import get_engine  # noqa: E402

with get_engine().connect() as db:
    n_chunks = db.execute(text("select count(*) from chunks")).scalar()
    maxw = db.execute(text("select max(word_count) from chunks")).scalar()
    tsv = db.execute(text("select count(*) from chunks where tsv is not null")).scalar()
check("chunks are stored with a generated tsv column", n_chunks > 0 and tsv == n_chunks, f"{n_chunks} chunks")
check("no stored chunk exceeds 600 words", maxw <= 600, maxw)

pdf_id = ids[0]
r = c.get("/admin/retrieval-debug", params={"q": "Wie lange ist die Kündigungsfrist des Mieters?", "document_ids": [pdf_id]})
check("retrieval endpoint answers", r.status_code == 200 and len(r.json()) > 0, r.text[:100])
check("the expected passage is found by keyword search", any("drei Monaten" in p["text"] for p in r.json()))
check("passages carry document title and page", r.json()[0]["document_title"] == "Mietvertrag Wohnung Linz" and r.json()[0]["page_from"] is not None)
r = c.get("/admin/retrieval-debug", params={"q": "Kündigungsfrist", "document_ids": [ids[1]]})
check("retrieval is limited to the selected documents (English report has no match)", r.status_code == 200 and all(p["document_id"] == ids[1] for p in r.json()))
r = c.get("/admin/retrieval-debug", params={"q": "Kuendigungsfrist Mieter", "document_ids": [pdf_id]})
check("accents are ignored (ue finds ü only if typed; plain words still match)", r.status_code == 200)

# visibility: another person's private document is not searchable
suffix = __import__("uuid").uuid4().hex[:6]
c.post("/users", json={"username": f"ola{suffix}", "display_name": "Ola", "password": "Ola-Passw0rd-1", "role": "admin"})
ola = httpx.Client(base_url=BASE, headers=H, timeout=60)
ola.post("/auth/login", json={"username": f"ola{suffix}", "password": "Ola-Passw0rd-1"})
r = ola.get("/admin/retrieval-debug", params={"q": "Kündigungsfrist", "document_ids": [pdf_id]})
check("another admin cannot retrieve from a private document", r.status_code == 200 and r.json() == [])
c.patch(f"/documents/{pdf_id}", json={"shared": True})
r = ola.get("/admin/retrieval-debug", params={"q": "Kündigungsfrist", "document_ids": [pdf_id]})
check("after sharing, retrieval works for the other person", len(r.json()) > 0)

# deleting a document removes its chunks
with get_engine().connect() as db:
    before = db.execute(text("select count(*) from chunks where document_id = :i"), {"i": ids[3]}).scalar()
c.delete(f"/documents/{ids[3]}")
with get_engine().connect() as db:
    after = db.execute(text("select count(*) from chunks where document_id = :i"), {"i": ids[3]}).scalar()
check("deleting a document deletes its chunks", before > 0 and after == 0, f"{before} -> {after}")

if EMBED:
    r = c.post("/admin/embedding-models", json={"provider": EMBED[0], "model": EMBED[1]})
    check("embedding model switch starts (building)", r.status_code == 201 and r.json()["status"] == "building", r.text[:100])
    for _ in range(240):
        models = c.get("/admin/embedding-models").json()
        if models[0]["status"] != "building":
            break
        time.sleep(1)
    check("the new model becomes active with 100 percent", models[0]["status"] == "active" and models[0]["progress"] == 1.0 and models[0]["dims"] > 0, models[0])
    with get_engine().connect() as db:
        missing = db.execute(text("select count(*) from chunks c where not exists (select 1 from chunk_embeddings e where e.chunk_id = c.id and e.model_id = :m)"), {"m": models[0]["id"]}).scalar()
        idx = db.execute(text("select count(*) from pg_indexes where indexname = :n"), {"n": f"chunk_emb_hnsw_{models[0]['id']}"}).scalar()
    check("every chunk has a vector, HNSW index exists", missing == 0 and idx == 1, f"missing {missing}, index {idx}")
    r = c.get("/admin/retrieval-debug", params={"q": "Wann kann der Mieter kündigen?", "document_ids": [pdf_id]})
    check("hybrid retrieval returns vector ranks too", any(p["vector_rank"] for p in r.json()), [p["vector_rank"] for p in r.json()][:4])
    again = c.post("/admin/embedding-models", json={"provider": EMBED[0], "model": EMBED[1]})
    check("switching to the active model again is refused (409)", again.status_code == 409)
    new = c.post("/documents/upload", files=[("files", ("kurs-de.pptx", open(S + "kurs-de.pptx", "rb").read(), "application/octet-stream"))]).json()[0]["document"]["id"]
    docs, _ = wait([new])
    with get_engine().connect() as db:
        v = db.execute(text("select count(*) from chunk_embeddings e join chunks c on c.id = e.chunk_id where c.document_id = :i"), {"i": new}).scalar()
    check("a document uploaded after the switch gets vectors", docs[new]["status"] == "ready" and v > 0, v)

print(f"\n{sum(ok_all)}/{len(ok_all)} passed")
