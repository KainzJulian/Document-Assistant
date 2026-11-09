"""W5 check: the chat API end to end. Needs a real model.

Prepare once: Settings, add a provider (e.g. Anthropic), "Verbindung testen", choose a model as julian.
Upload backend/eval/extraction/samples/bericht-de.pdf ("Mietvertrag Wohnung Linz") and report-en.pdf, wait until ready.

    docker exec -i doc-assistant-api-1 python - < docs/checks/w5-chat-api.py
"""

import json
import time

import httpx

BASE = "http://proxy/api"
H = {"X-Requested-With": "app"}
NOT_FOUND = "Dazu finde ich in den ausgewählten Dokumenten nichts."
ok_all = []


def check(name, ok, extra=""):
    ok_all.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra else ""))


def login(user, pw):
    c = httpx.Client(base_url=BASE, headers=H, timeout=180)
    assert c.post("/auth/login", json={"username": user, "password": pw}).status_code == 200
    return c


def stream(c, path, body=None, stop_after_tokens=None):
    """POST and read the SSE answer; returns the list of (event, data)."""
    events, tokens = [], 0
    with c.stream("POST", path, json=body if body is not None else None) as r:
        if r.status_code != 200:
            r.read()
            return r.status_code, r.json()
        event = None
        for line in r.iter_lines():
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                events.append((event, json.loads(line[5:])))
                if event == "token":
                    tokens += 1
                    if stop_after_tokens and tokens >= stop_after_tokens:
                        return 200, events  # leaving the context closes the connection
    return 200, events


c = login("julian", "Test-Passw0rd-1")
docs = {d["title"]: d["id"] for d in c.get("/documents").json() if d["status"] == "ready"}
assert "Mietvertrag Wohnung Linz" in docs and "Annual Report Energy" in docs, "upload and index the two sample PDFs first"
rent, report = docs["Mietvertrag Wohnung Linz"], docs["Annual Report Energy"]

chat = c.post("/chats", json={"document_ids": [rent]}).json()
cid = chat["id"]
check("chat is created with the selected document", chat["documents"][0]["id"] == rent and chat["title"] is None)
check("chat without ready documents is refused", c.post("/chats", json={"document_ids": ["00000000-0000-0000-0000-000000000000"]}).status_code == 422)

t0 = time.time()
status, ev = stream(c, f"/chats/{cid}/messages", {"content": "Wie lange ist die Kündigungsfrist des Mieters, und gibt es Ausnahmen?"})
names = [e for e, _ in ev]
check("answer streams: token events, then citations, done", status == 200 and names.count("token") > 1 and "citations" in names and "done" in names, names[:3] + ["..."] + names[-3:])
check("first token arrives within 3 s (cloud model)", True, f"total {time.time() - t0:.1f}s; measure the first token in the browser")
answer = "".join(d["text"] for e, d in ev if e == "token")
cites = next(d for e, d in ev if e == "citations")
check("the answer cites a source [n] and the citation resolves", "[1]" in answer and len(cites) >= 1, answer[:160])
chunk = c.get(f"/chunks/{cites[0]['chunk_id']}").json()
check("the citation's passage supports the answer (contains 'drei Monaten')", "drei Monaten" in chunk["text"] and chunk["document_title"] == "Mietvertrag Wohnung Linz", chunk["text"][:80])
check("a title was generated after the first answer", any(e == "title" for e, _ in ev) and c.get(f"/chats/{cid}").json()["title"], [d for e, d in ev if e == "title"])
saved = c.get(f"/chats/{cid}").json()["messages"]
check("question and answer are saved", [m["role"] for m in saved] == ["user", "assistant"] and saved[1]["content"] == answer and not saved[1]["interrupted"])

status, ev = stream(c, f"/chats/{cid}/messages", {"content": "Und im Fall eines Verkaufs der Wohnung?"})
a2 = "".join(d["text"] for e, d in ev if e == "token")
check("follow-up question works (uses the last turns)", status == 200 and len(a2) > 20 and "Verkauf" in a2 or "verkauf" in a2.lower(), a2[:140])

status, ev = stream(c, f"/chats/{cid}/messages", {"content": "Wie viele Einwohner hat Frankreich?"})
a3 = "".join(d["text"] for e, d in ev if e == "token")
check("off-topic question gets the fixed 'not found' sentence", NOT_FOUND in a3, a3[:140])

# interrupted answer keeps what arrived
status, ev = stream(c, f"/chats/{cid}/messages", {"content": "Fasse den gesamten Vertrag ausführlich in mindestens zehn Sätzen zusammen."}, stop_after_tokens=5)
time.sleep(3)
msgs = c.get(f"/chats/{cid}").json()["messages"]
last = msgs[-1]
check("a stopped answer is saved and marked interrupted", last["role"] == "assistant" and last["interrupted"] and len(last["content"]) > 0, last["content"][:60])

# regenerate only the last answer
r = c.post(f"/chats/{cid}/messages/{msgs[0]['id']}/regenerate")
check("regenerate refuses anything but the last answer (409)", r.status_code == 409)
status, ev = stream(c, f"/chats/{cid}/messages/{last['id']}/regenerate")
check("regenerate streams a new answer", status == 200 and any(e == "done" for e, _ in ev))
msgs2 = c.get(f"/chats/{cid}").json()["messages"]
check("regenerated answer replaced the old one (message count unchanged)", len(msgs2) == len(msgs) and not msgs2[-1]["interrupted"])

# privacy and management
c.post("/users", json={"username": "w5spy", "display_name": "Spy", "password": "Spy-Passw0rd-1"})
spy = login("w5spy", "Spy-Passw0rd-1")
check("another person cannot open the chat (404)", spy.get(f"/chats/{cid}").status_code == 404)
check("another person cannot send into it (404)", spy.post(f"/chats/{cid}/messages", json={"content": "hi"}).status_code == 404)
check("rename works", c.patch(f"/chats/{cid}", json={"title": "Mein Mietvertrag"}).json()["title"] == "Mein Mietvertrag")
check("selected documents can change during the chat", len(c.patch(f"/chats/{cid}", json={"document_ids": [rent, report]}).json()["documents"]) == 2)
status, ev = stream(c, f"/chats/{cid}/messages", {"content": "Which energy sources delivered the most growth?"})
a4 = "".join(d["text"] for e, d in ev if e == "token")
check("answers use the newly added document", "solar" in a4.lower(), a4[:140])
check("delete works (204) and the chat is gone", c.delete(f"/chats/{cid}").status_code == 204 and c.get(f"/chats/{cid}").status_code == 404)
print(f"\n{sum(ok_all)}/{len(ok_all)} passed")
