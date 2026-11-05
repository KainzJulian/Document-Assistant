"""Encrypt provider API keys at rest with Fernet (key from ``FERNET_KEY`` in .env)."""

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings
from app.errors import ApiError


def _fernet() -> Fernet:
    """Build the cipher from the configured key."""
    key = get_settings().fernet_key
    if not key:
        raise ApiError(500, "no_fernet_key", "FERNET_KEY ist nicht gesetzt (siehe docs/setup.md).")
    return Fernet(key.encode())


def encrypt(plain: str) -> str:
    """Encrypt a secret.

    Args:
        plain: The clear-text secret.

    Returns:
        A Fernet token as text.
    """
    return _fernet().encrypt(plain.encode()).decode()


def decrypt(token: str) -> str:
    """Decrypt a secret.

    Args:
        token: A Fernet token made by ``encrypt``.

    Returns:
        The clear-text secret.

    Raises:
        ApiError: If the token cannot be read, for example after the key was changed.
    """
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        raise ApiError(
            500, "key_unreadable", "Der gespeicherte Schlüssel kann nicht gelesen werden (FERNET_KEY geändert?)."
        ) from None
