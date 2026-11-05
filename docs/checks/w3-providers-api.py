"""W3 check (no real keys needed): run inside the api container.

    docker exec -i doc-assistant-api-1 python - < docs/checks/w3-providers-api.py

Covers: the Ollama verdict rules and need formula, German provider error mapping, key encryption,
write-only keys, settings and account endpoints, and the "Ollama nicht erreichbar" answer.
Real providers and real hardware are in docs/checks/w3-manual.md.
"""

import httpx

from app.providers.base import ProviderError, is_embedding_model, map_exception
from app.services.hardware import Hardware, need_gb, verdict_for
from app.services.secrets import decrypt, encrypt

BASE = "http://proxy/api"
H = {"X-Requested-With": "app"}
ok_all = []


def check(name, ok, extra=""):
    ok_all.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra else ""))


# --- pure rules -----------------------------------------------------------------------------
check("need formula: 8B model, 4.9 GB file, 8192 ctx", abs(need_gb(4.9, 8, 8192) - (1.15 * 4.9 + 0.5)) < 1e-9)


def hw(ram, vram, gpu=True):
    return Hardware(16, ram, "GPU" if gpu else None, vram, vram)


cases = [
    ("fits: free VRAM >= need", need_gb(4.9, 8, 8192), hw(10, 8), "fits"),
    ("partial: VRAM + RAM >= need", 9.0, hw(10, 4), "partial"),
    ("cpu_only: no GPU, RAM >= need", 6.1, hw(11, 0, gpu=False), "cpu_only"),
    ("cpu_only: GPU without free VRAM", 6.1, hw(11, 0), "cpu_only"),
    ("too_big: no GPU, RAM < need", 22.0, hw(11, 0, gpu=False), "too_big"),
    ("too_big: VRAM + RAM < need", 30.0, hw(10, 8), "too_big"),
    ("fits: exactly equal", 8.0, hw(1, 8), "fits"),
    ("cpu_only: RAM exactly equal", 11.0, hw(11, 0, gpu=False), "cpu_only"),
]
for name, need, h, expected in cases:
    check(f"verdict {name}", verdict_for(need, h) == expected, verdict_for(need, h))

# --- provider errors ------------------------------------------------------------------------
class Err(Exception):
    def __init__(self, status):
        self.status_code = status


check("401 maps to the key message", "Schlüssel" in map_exception(Err(401)).message)
check("429 maps to rate limit and keeps status 429", map_exception(Err(429)).status == 429)
check("404 maps to model not found", "nicht gefunden" in map_exception(Err(404)).message)
check("timeouts map to a German message", "rechtzeitig" in map_exception(TimeoutError()).message)
check("a ProviderError passes through unchanged", isinstance(map_exception(ProviderError("x")), ProviderError))
check("embedding model names are recognised", is_embedding_model("bge-m3") and is_embedding_model("text-embedding-3-small") and not is_embedding_model("llama3.1:8b"))

# --- encryption -----------------------------------------------------------------------------
token = encrypt("sk-test-123456")
check("encryption round trip, token is not the key", decrypt(token) == "sk-test-123456" and "sk-test" not in token)

# --- API ------------------------------------------------------------------------------------
admin = httpx.Client(base_url=BASE, headers=H, timeout=60)
assert admin.post("/auth/login", json={"username": "julian", "password": "Test-Passw0rd-1"}).status_code == 200
for p in admin.get("/admin/providers").json():
    admin.delete(f"/admin/providers/{p['id']}")

r = admin.post("/admin/providers", json={"kind": "anthropic", "label": "Anthropic", "api_key": "sk-test-SECRET-999"})
pid = r.json()["id"]
check("provider is created", r.status_code == 201 and r.json()["has_key"] is True)
check("the key is not in any response (create, list)", "SECRET" not in r.text and "SECRET" not in admin.get("/admin/providers").text)
check("cloud provider without key is refused", admin.post("/admin/providers", json={"kind": "openai", "label": "x"}).status_code == 422)
check("edit without a key keeps the stored key", admin.patch(f"/admin/providers/{pid}", json={"label": "Claude"}).json()["has_key"] is True)

from sqlalchemy import text  # noqa: E402

from app.db.session import get_engine  # noqa: E402

with get_engine().connect() as c:
    stored = c.execute(text("select api_key_enc from providers where id = :i"), {"i": pid}).scalar()
check("database holds an encrypted token, not the key", stored and "SECRET" not in stored and stored.startswith("gAAAA"))

t = admin.post(f"/admin/providers/{pid}/test")
check("connection test with a fake key fails politely (no crash, no key in text)", t.status_code == 200 and t.json()["ok"] is False and "SECRET" not in t.text, t.json().get("message"))

# make the provider usable for settings: cache a model list directly (a real test fills it)
with get_engine().begin() as c:
    c.execute(text("update providers set models = '[\"claude-test\", \"embed-test\"]'::jsonb where id = :i"), {"i": pid})
s = admin.get("/settings").json()
check("settings offer chat models only (embedding names filtered)", s["providers"][0]["models"] == ["claude-test"], s["providers"])
r = admin.put("/settings", json={"provider_id": pid, "model": "claude-test", "summary_language": "de"})
check("settings save", r.status_code == 200 and r.json()["model"] == "claude-test" and r.json()["summary_language"] == "de")
check("a model the provider does not offer is refused", admin.put("/settings", json={"provider_id": pid, "model": "nope", "summary_language": "de"}).status_code == 422)
check("disabled provider disappears from the choices", (admin.patch(f"/admin/providers/{pid}", json={"enabled": False}), admin.get("/settings").json()["providers"] == [])[1])
admin.patch(f"/admin/providers/{pid}", json={"enabled": True})

# members cannot manage providers
suffix = __import__("uuid").uuid4().hex[:6]
admin.post("/users", json={"username": f"mia{suffix}", "display_name": "Mia", "password": "Mia-Passw0rd-1"})
mia = httpx.Client(base_url=BASE, headers=H, timeout=60)
mia.post("/auth/login", json={"username": f"mia{suffix}", "password": "Mia-Passw0rd-1"})
check("member cannot list providers (403)", mia.get("/admin/providers").status_code == 403)
check("member has own settings, separate from the admin's", mia.get("/settings").json()["model"] is None)

# account
check("wrong current password is refused (400)", mia.patch("/auth/me", json={"current_password": "falsch", "new_password": "Neues-Passwort-1"}).status_code == 400)
check("display name can be changed", mia.patch("/auth/me", json={"display_name": "Mia B."}).json()["display_name"] == "Mia B.")
check("password can be changed with the current one", mia.patch("/auth/me", json={"current_password": "Mia-Passw0rd-1", "new_password": "Mia-Neu-Passw0rd-2"}).status_code == 200)
check("this session stays logged in after the change", mia.get("/auth/me").status_code == 200)

# Ollama not running in the test stack
r = admin.get("/hardware/ollama-fit", params={"model": "llama3.1:8b"})
check("hardware check without Ollama answers 503 'Ollama nicht erreichbar.'", r.status_code == 503 and "Ollama nicht erreichbar" in r.text, r.text[:90])
check("acknowledgement is stored", admin.post("/settings/ollama-ack", json={"model": "llama3.1:8b", "verdict": "cpu_only"}).status_code == 204)

admin.delete(f"/admin/providers/{pid}")
print(f"\n{sum(ok_all)}/{len(ok_all)} passed")
