"""W4.4 retrieval check: for each question, is the expected phrase in the top 8 passages?

Run inside the api container (needs the documents uploaded and ready):
    docker cp backend/eval/rag doc-assistant-api-1:/tmp/rag
    docker exec -i doc-assistant-api-1 python - < backend/eval/rag/run_retrieval.py

Pass: at least 90 percent hits (18 of 20 for a full question set).
Environment: USER and PASSWORD below; the account must be an admin (the debug endpoint is admin only).
"""

import httpx
import yaml

BASE = "http://proxy/api"
USER, PASSWORD = "julian", "Test-Passw0rd-1"

c = httpx.Client(base_url=BASE, headers={"X-Requested-With": "app"}, timeout=120)
assert c.post("/auth/login", json={"username": USER, "password": PASSWORD}).status_code == 200
titles = {d["title"]: d["id"] for d in c.get("/documents").json() if d["status"] == "ready"}
questions = yaml.safe_load(open("/tmp/rag/questions.yaml", encoding="utf-8"))

hits = 0
for q in questions:
    missing = [t for t in q["documents"] if t not in titles]
    if missing:
        print(f"SKIP {q['id']}: documents not ready or not found: {missing}")
        continue
    r = c.get("/admin/retrieval-debug", params={"q": q["question"], "document_ids": [titles[t] for t in q["documents"]]})
    if r.status_code != 200:
        print(f"ERR  {q['id']}: {r.status_code} {r.text[:120]}")
        continue
    passages = r.json()
    hit = any(q["expect"].lower() in p["text"].lower() for p in passages)
    hits += hit
    rank = next((i + 1 for i, p in enumerate(passages) if q["expect"].lower() in p["text"].lower()), None)
    print(("HIT  " if hit else "MISS ") + f"{q['id']}: rank {rank} of {len(passages)}  {q['question'][:60]}")

total = len(questions)
print(f"\n{hits}/{total} hits ({100 * hits // max(total, 1)} percent)")
print("PASS" if total and hits / total >= 0.9 else "BELOW TARGET (90 percent)")
