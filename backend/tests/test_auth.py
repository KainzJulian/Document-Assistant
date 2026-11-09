"""Login, sessions, CSRF header, lockout, user management, account changes."""

from conftest import ADMIN, login, make_user
from fastapi.testclient import TestClient


def test_login_sets_a_persistent_http_only_cookie(anon: TestClient) -> None:
    make_user("anna", "Anna-Passw0rd-1")
    response = anon.post("/api/auth/login", json={"username": "ANNA", "password": "Anna-Passw0rd-1"})
    cookie = response.headers["set-cookie"].lower()
    assert response.status_code == 200 and response.json()["username"] == "anna"
    assert "httponly" in cookie and "samesite=strict" in cookie and "max-age=2592000" in cookie
    assert "secure" not in cookie and "password" not in response.text


def test_wrong_password_and_unknown_user_give_the_same_error(anon: TestClient) -> None:
    make_user("anna", "Anna-Passw0rd-1")
    wrong = anon.post("/api/auth/login", json={"username": "anna", "password": "x"})
    unknown = anon.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_state_changing_requests_need_the_csrf_header(anon: TestClient) -> None:
    make_user("anna", "Anna-Passw0rd-1")
    del anon.headers["X-Requested-With"]
    response = anon.post("/api/auth/login", json={"username": "anna", "password": "Anna-Passw0rd-1"})
    assert response.status_code == 403 and response.json()["error"]["code"] == "csrf"


def test_unauthenticated_requests_get_401(anon: TestClient) -> None:
    response = anon.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


def test_five_failures_lock_the_account_even_for_the_right_password(anon: TestClient) -> None:
    make_user("anna", "Anna-Passw0rd-1")
    codes = [anon.post("/api/auth/login", json={"username": "anna", "password": "falsch"}).status_code for _ in range(5)]
    assert codes == [401] * 5
    locked = anon.post("/api/auth/login", json={"username": "anna", "password": "Anna-Passw0rd-1"})
    assert locked.status_code == 429 and locked.json()["error"]["code"] == "account_locked"


def test_password_reset_lifts_the_lock_and_ends_sessions(admin: TestClient, member_factory) -> None:
    anna = member_factory("anna")
    anna_id = anna.get("/api/auth/me").json()["id"]
    other = TestClient(admin.app)
    other.headers["X-Requested-With"] = "app"
    for _ in range(5):
        other.post("/api/auth/login", json={"username": "anna", "password": "falsch"})
    assert admin.patch(f"/api/users/{anna_id}", json={"password": "Neues-Passwort-2"}).status_code == 200
    assert anna.get("/api/auth/me").status_code == 401
    assert login(other, "anna", "Neues-Passwort-2").get("/api/auth/me").status_code == 200


def test_disabled_users_cannot_log_in_and_lose_their_session(admin: TestClient, member_factory) -> None:
    anna = member_factory("anna")
    anna_id = anna.get("/api/auth/me").json()["id"]
    admin.patch(f"/api/users/{anna_id}", json={"disabled": True})
    assert anna.get("/api/auth/me").status_code == 401
    fresh = TestClient(admin.app)
    fresh.headers["X-Requested-With"] = "app"
    assert fresh.post("/api/auth/login", json={"username": "anna", "password": "anna-Passw0rd-1"}).status_code == 401


def test_logout_ends_the_session(admin: TestClient) -> None:
    assert admin.post("/api/auth/logout").status_code == 204
    assert admin.get("/api/auth/me").status_code == 401


def test_only_admins_manage_users(admin: TestClient, member_factory) -> None:
    anna = member_factory("anna")
    assert anna.get("/api/users").status_code == 403
    assert anna.post("/api/users", json={"username": "x", "display_name": "x", "password": "Xxxxxxxx-1"}).status_code == 403
    assert len(admin.get("/api/users").json()) == 2


def test_create_user_validates_and_rejects_duplicates(admin: TestClient) -> None:
    ok = admin.post("/api/users", json={"username": "bea", "display_name": "Bea", "password": "Bea-Passw0rd-1"})
    assert ok.status_code == 201 and ok.json()["role"] == "member"
    assert admin.post("/api/users", json={"username": "BEA", "display_name": "x", "password": "Bea-Passw0rd-1"}).status_code == 409
    assert admin.post("/api/users", json={"username": "c", "display_name": "c", "password": "short"}).status_code == 422


def test_admin_cannot_disable_or_demote_themselves(admin: TestClient) -> None:
    me = admin.get("/api/auth/me").json()
    assert admin.patch(f"/api/users/{me['id']}", json={"disabled": True}).json()["error"]["code"] == "self_lockout"
    assert admin.patch(f"/api/users/{me['id']}", json={"role": "member"}).status_code == 400


def test_patch_unknown_user_is_404(admin: TestClient) -> None:
    assert admin.patch("/api/users/00000000-0000-0000-0000-000000000000", json={"display_name": "x"}).status_code == 404


def test_account_changes_need_the_current_password(member_factory) -> None:
    anna = member_factory("anna")
    assert anna.patch("/api/auth/me", json={"display_name": "Anna B."}).json()["display_name"] == "Anna B."
    assert anna.patch("/api/auth/me", json={"current_password": "falsch", "new_password": "Neues-Passwort-1"}).status_code == 400
    assert anna.patch("/api/auth/me", json={"current_password": "anna-Passw0rd-1", "new_password": "Neues-Passwort-1"}).status_code == 200
    assert anna.get("/api/auth/me").status_code == 200


def test_admin_fixture_is_an_admin(admin: TestClient) -> None:
    assert admin.get("/api/auth/me").json()["username"] == ADMIN[0]
