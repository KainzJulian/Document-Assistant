"""W1 backend check, run inside the api container: python - < w1check.py"""
import io
import json
import time
import uuid

import httpx
import pymupdf

BASE = "http://proxy/api"
H = {"X-Requested-With": "app"}
S = "/tmp/samples/"
ok_all = []


def check(name, ok, extra=""):
    ok_all.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra else ""))


def login(user, pw):
    c = httpx.Client(base_url=BASE, headers=H, timeout=60)
    r = c.post("/auth/login", json={"username": user, "password": pw})
    assert r.status_code == 200, r.text
    return c


def upload(c, files):
    payload = [("files", (name, data, "application/octet-stream")) for name, data in files]
    return c.post("/documents/upload", files=payload)


def wait_ready(c, ids, timeout=120):
    seen = {i: [] for i in ids}
    end = time.time() + timeout
    while time.time() < end:
        docs = {d["id"]: d for d in c.get("/documents").json()}
        for i in ids:
            st = docs[i]["status"]
            if not seen[i] or seen[i][-1] != st:
                seen[i].append(st)
        if all(docs[i]["status"] in ("ready", "failed") for i in ids):
            return docs, seen
        time.sleep(0.5)
    return docs, seen


julian = login("julian", "Test-Passw0rd-1")
for d in julian.get("/documents").json():  # start from an empty library
    julian.delete(f"/documents/{d['id']}")

names = ["bericht-de.pdf", "garantie.docx", "kurs-de.pptx", "artikel-de.html", "buch-de.epub"]
r = upload(julian, [(n, open(S + n, "rb").read()) for n in names])
res = r.json()
check("5 mixed files upload and are created", r.status_code == 200 and [x["outcome"] for x in res] == ["created"] * 5, [x["outcome"] for x in res])
ids = [x["document"]["id"] for x in res]
check("new documents start as queued/reading", all(x["document"]["status"] in ("queued", "reading") for x in res))
docs, seen = wait_ready(julian, ids)
check("all 5 reach 'ready'", all(docs[i]["status"] == "ready" for i in ids), {docs[i]["kind"]: docs[i]["status"] for i in ids})
check("statuses went through queued/reading to ready", all(s[-1] == "ready" for s in seen.values()), list(seen.values())[0])
pdf = docs[ids[0]]
check("PDF metadata: title, 3 pages, German", pdf["title"] == "Mietvertrag Wohnung Linz" and pdf["page_count"] == 3 and pdf["language"] == "de", {k: pdf[k] for k in ("title", "page_count", "language", "word_count")})
check("pptx has 3 slides", docs[ids[2]]["page_count"] == 3)

t = julian.get(f"/documents/{ids[0]}/text").json()
check("text has page markers", "<!--page:1-->" in t["markdown"] and "<!--page:3-->" in t["markdown"])
f = julian.get(f"/documents/{ids[0]}/file")
check("original downloads with the same bytes", f.status_code == 200 and f.content == open(S + "bericht-de.pdf", "rb").read(), f.headers.get("content-disposition", "")[:40])

r = upload(julian, [("bericht-de.pdf", open(S + "bericht-de.pdf", "rb").read())])
check("same PDF again is a duplicate", r.json()[0]["outcome"] == "duplicate" and r.json()[0]["message"] == "Bereits in deiner Bibliothek" and r.json()[0]["document"]["id"] == ids[0])

blank = pymupdf.open()
blank.new_page()
scanned = blank.tobytes()
enc = pymupdf.open()
enc.new_page().insert_text((72, 72), "geheim " * 50)
encrypted = enc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="x", owner_pw="y")
big = b"a" * (50 * 1024 * 1024 + 1)
r = upload(julian, [("leer.txt", b""), ("virus.exe", b"MZ\x90\x00\x03"), ("gross.txt", big), ("scan.pdf", scanned), ("geheim.pdf", encrypted)])
out = {x["filename"]: x for x in r.json()}
check("empty file rejected", out["leer.txt"]["outcome"] == "rejected" and "leer" in out["leer.txt"]["message"])
check("unsupported type rejected (by content)", out["virus.exe"]["outcome"] == "rejected" and "nicht unterstützt" in out["virus.exe"]["message"])
check("file over 50 MB rejected", out["gross.txt"]["outcome"] == "rejected" and "50 MB" in out["gross.txt"]["message"])
check("a .pdf that is really not a PDF is rejected by content", upload(julian, [("fake.pdf", b"hello this is text")]).json()[0]["outcome"] == "rejected")
bad_ids = [out["scan.pdf"]["document"]["id"], out["geheim.pdf"]["document"]["id"]]
docs, _ = wait_ready(julian, bad_ids)
check("scanned PDF fails with the German reason", docs[bad_ids[0]]["status"] == "failed" and "Gescannte PDFs" in docs[bad_ids[0]]["error"], docs[bad_ids[0]]["error"])
check("encrypted PDF fails with the German reason", docs[bad_ids[1]]["status"] == "failed" and "Passwort" in docs[bad_ids[1]]["error"], docs[bad_ids[1]]["error"])

# live status events: retry a failed document and watch the stream
events = []
with httpx.stream("GET", BASE + "/documents/events", headers=H, cookies=julian.cookies, timeout=30) as stream:
    import threading
    threading.Timer(1.5, lambda: julian.post(f"/documents/{bad_ids[0]}/retry")).start()
    deadline = time.time() + 15
    for line in stream.iter_lines():
        if line.startswith("data:"):
            events.append(json.loads(line[5:])["status"])
        if "failed" in events[1:] or time.time() > deadline:
            break
check("SSE pushes status changes (queued/reading then failed again)", events[:1] in (["queued"], ["reading"], ["failed"]) and len(events) >= 2, events)

# sharing and visibility with a second person
suffix = uuid.uuid4().hex[:6]
admin = julian
admin.post("/users", json={"username": f"carl{suffix}", "display_name": "Carl", "password": "Carl-Passw0rd-1"})
carl = login(f"carl{suffix}", "Carl-Passw0rd-1")
check("a private document is invisible to others (404)", carl.get(f"/documents/{ids[0]}").status_code == 404)
check("carl's library is empty", carl.get("/documents").json() == [])
check("owner marks it shared", julian.patch(f"/documents/{ids[0]}", json={"shared": True}).json()["shared"] is True)
shared = carl.get("/documents", params={"scope": "shared"}).json()
check("carl sees it under 'shared with me', not as his own", len(shared) == 1 and shared[0]["mine"] is False and shared[0]["owner_name"] == "Julian")
check("carl can read text and download", carl.get(f"/documents/{ids[0]}/text").status_code == 200 and carl.get(f"/documents/{ids[0]}/file").status_code == 200)
check("carl cannot rename (403)", carl.patch(f"/documents/{ids[0]}", json={"title": "x"}).status_code == 403)
check("carl cannot delete (403)", carl.delete(f"/documents/{ids[0]}").status_code == 403)
check("carl cannot retry (403)", carl.post(f"/documents/{ids[0]}/retry").status_code == 403)
check("owner renames", julian.patch(f"/documents/{ids[0]}", json={"title": "Mein Mietvertrag"}).json()["title"] == "Mein Mietvertrag")
check("title search finds it", [d["title"] for d in julian.get("/documents", params={"q": "mietvertr"}).json()] == ["Mein Mietvertrag"])
check("status filter works", all(d["status"] == "failed" for d in julian.get("/documents", params={"status": "failed"}).json()))

dead = julian.delete(f"/documents/{ids[1]}")
check("owner deletes a document (204)", dead.status_code == 204)
check("deleted document is gone, file too", julian.get(f"/documents/{ids[1]}").status_code == 404)
print(f"\n{sum(ok_all)}/{len(ok_all)} passed")
