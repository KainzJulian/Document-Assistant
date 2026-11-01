"""FastAPI dependencies: database session, CSRF header, current user."""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import User, UserSession
from app.db.session import get_session
from app.errors import ApiError
from app.security import hash_token

SESSION_COOKIE = "sid"
_SLIDE_AFTER = timedelta(hours=1)

# NOTE: scope="function" commits before the response is sent. With the default "request"
# scope the commit would happen after the response, and a client that calls the API
# right after login could still see the old state.
DbSession = Annotated[Session, Depends(get_session, scope="function")]


def set_session_cookie(response: Response, token: str) -> None:
    """Set the session cookie: HttpOnly, SameSite=Strict, no Secure flag (plain HTTP LAN).

    Args:
        response: Response that carries the cookie.
        token: Raw session token.
    """
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=get_settings().session_days * 86400,
        httponly=True,
        samesite="strict",
        secure=False,
        path="/",
    )


def require_csrf_header(request: Request) -> None:
    """Reject state-changing requests that lack ``X-Requested-With: app``.

    Args:
        request: The incoming request.

    Raises:
        ApiError: 403 if the header is missing on a non-safe method.
    """
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        if request.headers.get("x-requested-with") != "app":
            raise ApiError(403, "csrf", "Ungültige Anfrage.")


def current_user(request: Request, response: Response, db: DbSession) -> User:
    """Return the logged-in user and slide the session expiry.

    Args:
        request: The incoming request (cookie source).
        response: Response, used to refresh the cookie lifetime.
        db: Database session.

    Returns:
        The authenticated, enabled user.

    Raises:
        ApiError: 401 if there is no valid session or the account is disabled.
    """
    not_authenticated = ApiError(401, "not_authenticated", "Bitte melde dich an.")
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise not_authenticated
    now = datetime.now(UTC)
    row = db.get(UserSession, hash_token(token))
    if row is None or row.expires_at < now:
        raise not_authenticated
    user = db.get(User, row.user_id)
    if user is None or user.disabled:
        raise not_authenticated
    if now - row.last_seen_at > _SLIDE_AFTER:
        row.last_seen_at = now
        row.expires_at = now + timedelta(days=get_settings().session_days)
        set_session_cookie(response, token)
    return user


def require_admin(user: Annotated[User, Depends(current_user)]) -> User:
    """Return the current user if they are an admin.

    Args:
        user: The authenticated user.

    Returns:
        The same user.

    Raises:
        ApiError: 403 for members.
    """
    if user.role != "admin":
        raise ApiError(403, "forbidden", "Dafür fehlt die Berechtigung.")
    return user
