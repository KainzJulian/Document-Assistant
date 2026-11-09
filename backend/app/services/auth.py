"""Login, lockout and session handling."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import User, UserSession
from app.errors import ApiError
from app.security import DUMMY_HASH, new_session_token, verify_password

MAX_FAILED_LOGINS = 5
FAILED_WINDOW = timedelta(minutes=15)
LOCK_DURATION = timedelta(minutes=15)


def _invalid() -> ApiError:
    """Return the generic wrong-credentials error (same for unknown user and bad password)."""
    return ApiError(401, "invalid_credentials", "Benutzername oder Passwort ist falsch.")


def _now() -> datetime:
    """Return the current time in UTC."""
    return datetime.now(UTC)


def _register_failure(db: Session, user: User, now: datetime) -> None:
    """Count a failed login and lock the account after five within 15 minutes.

    Commits immediately, because the request ends with an error and the session
    dependency would otherwise roll the counter back.
    """
    window = user.failed_window_started_at
    if window is None or now - window > FAILED_WINDOW:
        user.failed_window_started_at = now
        user.failed_logins = 1
    else:
        user.failed_logins += 1
    if user.failed_logins >= MAX_FAILED_LOGINS:
        user.locked_until = now + LOCK_DURATION
        user.failed_logins = 0
        user.failed_window_started_at = None
    db.commit()


def authenticate(db: Session, username: str, password: str) -> User:
    """Check credentials, enforcing the lockout rule.

    Args:
        db: Database session.
        username: Login name (case-insensitive).
        password: Clear-text password.

    Returns:
        The authenticated user.

    Raises:
        ApiError: 401 for wrong credentials or a disabled account, 429 while locked.
    """
    now = _now()
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        verify_password(DUMMY_HASH, password)
        raise _invalid()
    if user.locked_until is not None and user.locked_until > now:
        raise ApiError(
            429,
            "account_locked",
            "Zu viele Fehlversuche. Bitte versuche es in 15 Minuten erneut.",
        )
    if not verify_password(user.password_hash, password) or user.disabled:
        _register_failure(db, user, now)
        raise _invalid()
    user.failed_logins = 0
    user.failed_window_started_at = None
    user.locked_until = None
    return user


def create_session(db: Session, user: User, session_days: int) -> str:
    """Create a login session and drop expired ones.

    Args:
        db: Database session.
        user: The logged-in user.
        session_days: Lifetime of the session in days.

    Returns:
        The raw token for the cookie.
    """
    now = _now()
    db.execute(delete(UserSession).where(UserSession.expires_at < now))
    token, token_hash = new_session_token()
    db.add(
        UserSession(
            id=token_hash,
            user_id=user.id,
            expires_at=now + timedelta(days=session_days),
            last_seen_at=now,
        )
    )
    return token


def end_sessions(db: Session, user_id: uuid.UUID) -> None:
    """Log a user out everywhere (used on disable and password reset).

    Args:
        db: Database session.
        user_id: Id of the user whose sessions are removed.
    """
    db.execute(delete(UserSession).where(UserSession.user_id == user_id))
