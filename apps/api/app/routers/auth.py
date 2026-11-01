"""Login, logout and the current user."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete

from app.config import get_settings
from app.db.models import User, UserSession
from app.deps import SESSION_COOKIE, DbSession, current_user, set_session_cookie
from app.models.auth import LoginRequest, UserOut
from app.security import hash_token
from app.services.auth import authenticate, create_session

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginRequest, response: Response, db: DbSession) -> UserOut:
    """Log in with username and password and set the session cookie.

    Args:
        body: Credentials.
        response: Response that receives the cookie.
        db: Database session.

    Returns:
        The logged-in user.
    """
    user = authenticate(db, body.username, body.password)
    token = create_session(db, user, get_settings().session_days)
    set_session_cookie(response, token)
    return UserOut.model_validate(user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: DbSession) -> None:
    """End the current session; works without a valid session.

    Args:
        request: The incoming request (cookie source).
        response: Response that clears the cookie.
        db: Database session.
    """
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        db.execute(delete(UserSession).where(UserSession.id == hash_token(token)))
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me")
def me(user: Annotated[User, Depends(current_user)]) -> UserOut:
    """Return the logged-in user.

    Args:
        user: The authenticated user.

    Returns:
        The user.
    """
    return UserOut.model_validate(user)
