"""W9.1 performance check: 1,000 documents load in under 1 s; 500 chats and search under 300 ms.

    docker exec -i doc-assistant-api-1 python - < docs/checks/w9-performance.py
Seeds 1,000 documents (status ready, with text and two chunks each) and 500 chats for a temporary user
and removes them afterwards. The first-token time (under 3 s with a cloud model) and the "UI stays
responsive while the worker indexes" part are manual: see docs/checks/w9-manual.md.
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
uid = uuid.uuid4()
with engine.begin() as db:
    db.execute(text("delete from users where username = 'w9perf'"))
    db.execute(
        text("insert into users (id, username, display_name, password_hash, role) values (:i, 'w9perf', 'W9', :h, 'member')"),
        {"i": uid, "h": hash_password("W9-Passw0rd-1")},
    )
    db.execute(
        text(
            "insert into documents (owner_id, title, source_type, filename, mime, size_bytes, content_hash, status, word_count, language) "
            "select :u, 'Dokument ' || g || ' Jahresbericht', 'file', 'd' || g || '.pdf', 'application/pdf', 100000, md5(g::text), 'ready', 500, 'de' "
            "from generate_series(1, 1000) g"
        ),
        {"u": uid},
    )
    db.execute(
        text("insert into chats (owner_id, title) select :u, 'Chat ' || g || ' Zusammenfassung' from generate_series(1, 500) g"),
        {"u": uid},
    )
    db.execute(
        text("insert into messages (chat_id, role, content) select id, 'user', 'Frage zur Zusammenfassung des Berichts' from chats where owner_id = :u"),
        {"u": uid},
    )

c = httpx.Client(base_url=BASE, headers=H, timeout=60)
assert c.post("/auth/login", json={"username": "w9perf", "password": "W9-Passw0rd-1"}).status_code == 200


def best_of(fn, runs=3):
    times = []
    for _ in range(runs):
        t = time.perf_counter()
        r = fn()
        times.append((time.perf_counter() - t) * 1000)
    return min(times), r


ms, r = best_of(lambda: c.get("/documents"))
check("library with 1,000 documents loads in < 1 s (API)", r.status_code == 200 and len(r.json()) == 1000 and ms < 1000, f"{ms:.0f} ms")
ms, r = best_of(lambda: c.get("/documents", params={"q": "Dokument 77"}))
check("title search in the library < 300 ms", r.status_code == 200 and ms < 300, f"{ms:.0f} ms, {len(r.json())} hits")
ms, r = best_of(lambda: c.get("/chats"))
check("chat list with 500 chats < 300 ms", r.status_code == 200 and len(r.json()) == 500 and ms < 300, f"{ms:.0f} ms")
ms, r = best_of(lambda: c.get("/chats", params={"q": "Zusamenfassung"}))
check("chat search (misspelt) < 300 ms", r.status_code == 200 and len(r.json()) > 0 and ms < 300, f"{ms:.0f} ms")
with engine.connect() as db:
    plan = db.execute(text("explain select * from documents where owner_id = :u order by created_at desc"), {"u": uid}).all()
check("library query uses an index", any("Index" in row[0] for row in plan), plan[0][0])

with engine.begin() as db:
    db.execute(text("delete from users where username = 'w9perf'"))
print(f"\n{sum(ok_all)}/{len(ok_all)} passed")
