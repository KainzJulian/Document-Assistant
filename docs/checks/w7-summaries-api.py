"""W7 check. The first block needs nothing; the live block needs a real model and two documents.

    docker exec -i doc-assistant-api-1 python - < docs/checks/w7-summaries-api.py

Live block: upload backend/eval/extraction/samples/bericht-de.pdf (short, ~540 words) and a 200-page PDF made with
`docs/checks/make-big-pdf.py`, wait until both are ready, and choose a model in the settings.
Set LIVE = False to run only the rules.
"""

import json

import httpx

from app.services.summarising import TARGETS, effective_target, split_parts, within_tolerance

LIVE = True
BASE = "http://proxy/api"
H = {"X-Requested-With": "app"}
ok_all = []


def check(name, ok, extra=""):
    ok_all.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra else ""))


# --- rules (no model) -----------------------------------------------------------------------
check("targets are 50, 150, 300, 600, 1200", [TARGETS[k] for k in ("xs", "s", "m", "l", "xl")] == [50, 150, 300, 600, 1200])
check("long source: nominal target is used", effective_target("xl", 30000) == (1200, None))
t, note = effective_target("xl", 540)
check("short source: capped at a third, with the German note", t == 180 and note == "Quelle ist kurz – auf 180 Wörter begrenzt", (t, note))
check("a length below the cap is not capped", effective_target("xs", 540) == (50, None))
check("tolerance: 300 target accepts 240..360", within_tolerance(240, 300) and within_tolerance(360, 300) and not within_tolerance(239, 300) and not within_tolerance(361, 300))
text = "\n\n".join("Wort " * 100 for _ in range(100))  # 100 paragraphs of 100 words
parts = split_parts(text)
check("10,000 words split into parts of about 3,000 words", 3 <= len(parts) <= 5 and all(len(p.split()) <= 3100 for p in parts), [len(p.split()) for p in parts])
check("page markers are dropped from parts", all("<!--page" not in p for p in split_parts("<!--page:1-->\n\nHallo Welt\n\n<!--page:2-->\n\nZweiter Absatz")))

if LIVE:
    c = httpx.Client(base_url=BASE, headers=H, timeout=600)
    assert c.post("/auth/login", json={"username": "julian", "password": "Test-Passw0rd-1"}).status_code == 200
    docs = {d["title"]: d for d in c.get("/documents").json() if d["status"] == "ready"}
    short = docs["Mietvertrag Wohnung Linz"]
    big = next((d for t, d in docs.items() if d["page_count"] and d["page_count"] >= 150), None)

    def summarise(doc_id, length, language="source"):
        events = []
        with c.stream("POST", f"/documents/{doc_id}/summaries", json={"length": length, "language": language}) as r:
            if r.status_code != 200:
                r.read()
                return r.status_code, r.json()
            name = None
            for line in r.iter_lines():
                if line.startswith("event:"):
                    name = line[6:].strip()
                elif line.startswith("data:"):
                    events.append((name, json.loads(line[5:])))
        return 200, events

    for length in ("xs", "s", "m", "l", "xl"):
        status, ev = summarise(short["id"], length)
        done = next((d["summary"] for e, d in ev if e == "done"), None)
        ok = bool(done) and within_tolerance(done["word_count"], done["target_words"])
        check(f"short document, {length}: within 20 percent of the target ({done['target_words'] if done else '?'})", ok, done and done["word_count"])
    status, ev = summarise(short["id"], "xl")
    done = next(d["summary"] for e, d in ev if e == "done")
    check("xl on a short document is capped and says so", done["target_words"] < 1200 and done["note"] and "begrenzt" in done["note"], done["note"])
    check("summaries are listed, one per length", sorted(s["length"] for s in c.get(f"/documents/{short['id']}/summaries").json()) == ["l", "m", "s", "xl", "xs"])
    before = c.get(f"/documents/{short['id']}/summaries").json()
    summarise(short["id"], "s")
    after = c.get(f"/documents/{short['id']}/summaries").json()
    check("'Neu erstellen' replaces, never duplicates", len(after) == len(before) == 5)
    status, ev = summarise(short["id"], "s", "de")
    check("language 'Deutsch' works", status == 200 and any(e == "done" for e, _ in ev))
    check("model and date are saved with the summary", all(s["model"] and s["created_at"] for s in after))

    if big:
        status, ev = summarise(big["id"], "m")
        progress = [d["label"] for e, d in ev if e == "progress"]
        done = next((d["summary"] for e, d in ev if e == "done"), None)
        check("200-page document is summarised in parts with 'Teil n von m' progress", any(p.startswith("Teil 1 von") for p in progress), progress[:3])
        check("long document result is within tolerance", done and within_tolerance(done["word_count"], done["target_words"]), done and done["word_count"])
    else:
        print("SKIP 200-page document not found (upload docs/checks/make-big-pdf.py output)")

    # shared documents: another person sees the summaries and can create their own
    c.patch(f"/documents/{short['id']}", json={"shared": True})
    suffix = __import__("uuid").uuid4().hex[:6]
    c.post("/users", json={"username": f"sam{suffix}", "display_name": "Sam", "password": "Sam-Passw0rd-1"})
    sam = httpx.Client(base_url=BASE, headers=H, timeout=60)
    sam.post("/auth/login", json={"username": f"sam{suffix}", "password": "Sam-Passw0rd-1"})
    check("a person the document is shared with sees its summaries", len(sam.get(f"/documents/{short['id']}/summaries").json()) == 5)
    check("without a model chosen, creating a summary is refused with a clear message", sam.post(f"/documents/{short['id']}/summaries", json={"length": "s"}).status_code == 422)
    c.patch(f"/documents/{short['id']}", json={"shared": False})
    check("an unshared private document's summaries are invisible (404)", sam.get(f"/documents/{short['id']}/summaries").status_code == 404)

print(f"\n{sum(ok_all)}/{len(ok_all)} passed")
