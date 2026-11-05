"""W6 check: chat search (typo tolerant, < 300 ms with 500 chats) and privacy. No model needed.

    docker exec -i doc-assistant-api-1 python - < docs/checks/w6-search-api.py
Seeds 500 chats for the user "w6seed" directly in the database and removes them afterwards.
"""

import time
import uuid

import httpx
from sqlalchemy import text

from app.db.session import get_engine
from app.security import hash_password

BASE = "http://proxy/api"
H = {"X-Requested-With": "app"}
ok_all = []


def check(name, ok, extra=""):
    ok_all.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra else ""))


engine = get_engine()
seed_id, other_id = uuid.uuid4(), uuid.uuid4()
with engine.begin() as db:
    for uid, name in ((seed_id, "w6seed"), (other_id, "w6other")):
        db.execute(text("delete from users where username = :n"), {"n": name})
        db.execute(
            text("insert into users (id, username, display_name, password_hash, role) values (:i, :n, :n, :h, 'member')"),
            {"i": uid, "n": name, "h": hash_password("W6-Passw0rd-1")},
        )
    topics = ["Jahresbericht", "Mietvertrag", "Garantie Geschirrspüler", "Photovoltaik", "Italienisch Lernplan"]
    special = None
    for i in range(500):
        cid = uuid.uuid4()
        title = f"{topics[i % 5]} {i}"
        db.execute(text("insert into chats (id, owner_id, title) values (:i, :o, :t)"), {"i": cid, "o": seed_id, "t": title})
        body = "Bitte gib mir eine Zusammenfassung des Jahresberichts mit den wichtigsten Zahlen." if i == 250 else f"Frage {i} zu {topics[i % 5]}: wie ist der Stand der Dinge?"
        db.execute(text("insert into messages (chat_id, role, content) values (:c, 'user', :b)"), {"c": cid, "b": body})
        db.execute(text("insert into messages (chat_id, role, content, tokens_out) values (:c, 'assistant', 'Antwort ohne besonderen Inhalt.', 5)"), {"c": cid})
        if i == 250:
            special = cid
    secret_chat = uuid.uuid4()
    db.execute(text("insert into chats (id, owner_id, title) values (:i, :o, 'Geheimprojekt Nordlicht')"), {"i": secret_chat, "o": other_id})
    db.execute(text("insert into messages (chat_id, role, content) values (:c, 'user', 'Nordlicht ist streng vertraulich')"), {"c": secret_chat})

c = httpx.Client(base_url=BASE, headers=H, timeout=30)
assert c.post("/auth/login", json={"username": "w6seed", "password": "W6-Passw0rd-1"}).status_code == 200

r = c.get("/chats")
check("list shows all 500 chats, newest first", len(r.json()) == 500 and r.json()[0]["updated_at"] >= r.json()[-1]["updated_at"])


def timed(q):
    t = time.perf_counter()
    res = c.get("/chats", params={"q": q})
    return res, (time.perf_counter() - t) * 1000


res, ms = timed("Jahresbericht")
check("search answers in < 300 ms with 500 chats", res.status_code == 200 and ms < 300, f"{ms:.0f} ms, {len(res.json())} results")
res, ms = timed("Zusamenfassung")
hit = [x for x in res.json() if x["id"] == str(special)]
check("a misspelt word ('Zusamenfassung') still finds the chat", len(hit) == 1, f"{ms:.0f} ms, {len(res.json())} results")
check("the snippet marks the matching word", hit and "[[Zusammenfassung]]" in hit[0]["snippet"], hit[0]["snippet"] if hit else None)
check("the result carries the matching message id (for scroll-to-match)", hit and hit[0]["message_id"])
res, _ = timed("jahresberict")
check("typo in a title word finds chats by title", len(res.json()) > 0)
res, _ = timed("Nordlicht")
check("another person's chats are never found", res.json() == [])
res, _ = timed("xyzabc")
check("no match gives an empty list", res.json() == [])
res, _ = timed("Mietvertrag Stand")
check("several words work", res.status_code == 200 and len(res.json()) > 0)
res, _ = timed("garantie geschirrspueler")
check("accents/umlauts: 'geschirrspueler' still finds Geschirrspüler (similarity)", len(res.json()) > 0)

with engine.begin() as db:
    db.execute(text("delete from users where username in ('w6seed', 'w6other')"))
print(f"\n{sum(ok_all)}/{len(ok_all)} passed")
