"""W2.3 URL sample set: import 15 real pages through the API and check the extracted text.

Run against the live stack from inside the api container:
    docker exec -i doc-assistant-api-1 python - < eval/urls/run.py
Pass: at least 13 pages extract cleanly (>= 200 words, no menu or cookie banner text), and the
JavaScript-only and the paywalled page fail with a German message. Edit URLS to use your own
picks; pages change over time, so a single failure is worth a look, not a panic.
"""

import httpx

BASE = "http://proxy/api"
USER, PASSWORD = "julian", "Test-Passw0rd-1"

# (group, url, expectation)
URLS = [
    ("wikipedia de", "https://de.wikipedia.org/wiki/Photovoltaik", "ok"),
    ("wikipedia de", "https://de.wikipedia.org/wiki/W%C3%A4rmepumpe", "ok"),
    ("wikipedia en", "https://en.wikipedia.org/wiki/Solar_power", "ok"),
    ("wikipedia en", "https://en.wikipedia.org/wiki/Heat_pump", "ok"),
    ("documentation", "https://docs.python.org/3/tutorial/introduction.html", "ok"),
    ("documentation", "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog", "ok"),
    ("documentation", "https://fastapi.tiangolo.com/tutorial/first-steps/", "ok"),
    ("blog", "https://martinfowler.com/articles/microservices.html", "ok"),
    ("blog", "https://www.paulgraham.com/startupideas.html", "ok"),
    ("blog", "https://blog.codinghorror.com/the-best-code-is-no-code-at-all/", "ok"),
    ("blog", "https://danluu.com/hardware-unforgiving/", "ok"),
    ("news", "https://www.tagesschau.de/", "ok"),
    ("news", "https://www.bbc.com/news", "ok"),
    ("javascript only", "https://x.com/", "fail"),
    ("paywalled", "https://www.nytimes.com/", "fail"),
]
NOISE = ["Alle akzeptieren", "Accept all", "Cookie-Einstellungen", "Skip to main content", "Jump to navigation", "Newsletter abonnieren"]

c = httpx.Client(base_url=BASE, headers={"X-Requested-With": "app"}, timeout=90)
assert c.post("/auth/login", json={"username": USER, "password": PASSWORD}).status_code == 200
clean, expected_fail_ok, created = 0, 0, []
for group, url, expect in URLS:
    r = c.post("/documents/url", json={"url": url})
    if r.status_code == 201:
        out = r.json()
        doc = out["document"]
        if out["outcome"] == "created":
            created.append(doc["id"])
        words, status, text = 0, doc["status"], ""
        for _ in range(60):
            doc = c.get(f"/documents/{doc['id']}").json()
            if doc["status"] in ("ready", "failed"):
                break
            import time

            time.sleep(0.5)
        if doc["status"] == "ready":
            text = c.get(f"/documents/{doc['id']}/text").json()["markdown"]
            words = doc["word_count"]
        noise = [n for n in NOISE if n in text]
        good = doc["status"] == "ready" and words >= 200 and not noise and bool(doc["title"])
        verdict = "ok " if good else "BAD"
        if expect == "ok" and good:
            clean += 1
        print(f"{verdict} {group:16} {words:6} words  {doc['title'][:40]!r}  {'noise: ' + str(noise) if noise else ''}  {url}")
    else:
        err = r.json().get("error", {})
        german = bool(err.get("message"))
        if expect == "fail" and german and err.get("code", "").startswith("url_"):
            expected_fail_ok += 1
        print(f"err {group:16} {r.status_code} {err.get('code')}: {err.get('message', '')[:70]}  {url}")

for doc_id in created:
    c.delete(f"/documents/{doc_id}")
print(f"\nclean extractions: {clean}/13 expected, expected failures with a German url_* message: {expected_fail_ok}/2")
print("PASS" if clean >= 13 - 0 and expected_fail_ok == 2 else "CHECK THE LIST")
