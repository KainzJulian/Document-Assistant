"""Password hashing and session token helpers."""

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()

# NOTE: Verified when a username does not exist, so unknown and known usernames take
# about the same time and logins cannot be used to enumerate accounts.
DUMMY_HASH = _hasher.hash("dummy-password-for-timing")


def hash_password(plain: str) -> str:
    """Hash a password with argon2id.

    Args:
        plain: The clear-text password.

    Returns:
        The encoded hash.
    """
    return _hasher.hash(plain)


def verify_password(password_hash: str, plain: str) -> bool:
    """Check a password against its hash.

    Args:
        password_hash: Stored argon2 hash.
        plain: Clear-text password to check.

    Returns:
        True if the password matches.
    """
    try:
        return _hasher.verify(password_hash, plain)
    except (VerificationError, InvalidHashError):
        return False


def hash_token(token: str) -> str:
    """Return the SHA-256 hex digest that identifies a session in the database."""
    return hashlib.sha256(token.encode()).hexdigest()


def new_session_token() -> tuple[str, str]:
    """Create a random session token.

    Returns:
        A pair ``(token, token_hash)``: the token goes into the cookie, the hash into
        ``sessions.id``.
    """
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)
