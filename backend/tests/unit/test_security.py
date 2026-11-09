"""Password hashing and session tokens."""

from app.security import DUMMY_HASH, hash_password, hash_token, new_session_token, verify_password


def test_correct_password_verifies_and_wrong_one_does_not() -> None:
    hashed = hash_password("Sommer-Passw0rt")
    assert verify_password(hashed, "Sommer-Passw0rt") is True
    assert verify_password(hashed, "sommer-passw0rt") is False


def test_hash_is_salted_and_never_the_password() -> None:
    a, b = hash_password("gleich"), hash_password("gleich")
    assert a != b and "gleich" not in a and a.startswith("$argon2id$")


def test_broken_hash_is_a_mismatch_not_a_crash() -> None:
    assert verify_password("kein-hash", "x") is False
    assert verify_password("", "x") is False


def test_dummy_hash_never_matches_a_real_password() -> None:
    assert verify_password(DUMMY_HASH, "irgendwas") is False


def test_session_token_and_its_hash() -> None:
    token, token_hash = new_session_token()
    assert token_hash == hash_token(token) and len(token_hash) == 64 and token != token_hash
    assert new_session_token()[0] != token
