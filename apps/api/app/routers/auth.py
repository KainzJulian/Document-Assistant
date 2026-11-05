"""Login, logout and the current user."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete

from app.config import get_settings
from app.db.models import User, UserSession
from app.deps import SESSION_COOKIE, DbSession, current_user, set_session_cookie
from app.errors import ApiError
from app.models.ai import AccountPatch
from app.models.auth import LoginRequest, UserOut
from app.security import hash_password, hash_token, verify_password
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


@router.patch("/me")
def update_me(
    body: AccountPatch, request: Request, user: Annotated[User, Depends(current_user)], db: DbSession
) -> UserOut:
    """Change the person's own display name and/or password.

    A new password needs the current one and logs out all other devices.

    Args:
        body: Fields to change.
        request: The request (to keep the current session).
        user: The logged-in person.
        db: Database session.

    Returns:
        The updated user.

    Raises:
        ApiError: 400 if the current password is missing or wrong.
    """
    if body.display_name is not None:
        user.display_name = body.display_name.strip()
    if body.new_password is not None:
        if not body.current_password or not verify_password(user.password_hash, body.current_password):
            raise ApiError(400, "wrong_password", "Das aktuelle Passwort stimmt nicht.")
        user.password_hash = hash_password(body.new_password)
        token = request.cookies.get(SESSION_COOKIE)
        keep = hash_token(token) if token else ""
        db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.id != keep))
    db.flush()
    return UserOut.model_validate(user)
