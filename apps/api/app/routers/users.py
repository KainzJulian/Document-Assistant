"""User management (admin only)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.db.models import User
from app.deps import DbSession, require_admin
from app.errors import ApiError
from app.models.auth import UserCreate, UserOut, UserPatch
from app.security import hash_password
from app.services.auth import end_sessions

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(require_admin)])


@router.get("")
def list_users(db: DbSession) -> list[UserOut]:
    """List all household accounts.

    Args:
        db: Database session.

    Returns:
        Users ordered by name.
    """
    users = db.scalars(select(User).order_by(User.display_name)).all()
    return [UserOut.model_validate(u) for u in users]


@router.post("", status_code=201)
def create_user(body: UserCreate, db: DbSession) -> UserOut:
    """Create a household account.

    Args:
        body: The new user's data.
        db: Database session.

    Returns:
        The created user.

    Raises:
        ApiError: 409 if the username exists.
    """
    if db.scalar(select(User.id).where(User.username == body.username)) is not None:
        raise ApiError(409, "username_taken", "Dieser Benutzername ist schon vergeben.")
    user = User(
        username=body.username,
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.flush()
    return UserOut.model_validate(user)


@router.patch("/{user_id}")
def patch_user(
    user_id: uuid.UUID,
    body: UserPatch,
    db: DbSession,
    admin: Annotated[User, Depends(require_admin)],
) -> UserOut:
    """Change name, role, disabled flag or password of a user.

    A password reset or re-enabling also lifts a login lockout. Disabling a user or
    resetting their password logs them out everywhere.

    Args:
        user_id: Id of the user to change.
        body: Fields to change.
        db: Database session.
        admin: The acting admin.

    Returns:
        The updated user.

    Raises:
        ApiError: 404 if the user does not exist, 400 if an admin would lock themselves out.
    """
    user = db.get(User, user_id)
    if user is None:
        raise ApiError(404, "user_not_found", "Benutzer nicht gefunden.")
    if user.id == admin.id and (body.disabled is True or body.role == "member"):
        raise ApiError(
            400,
            "self_lockout",
            "Du kannst dich nicht selbst deaktivieren oder herabstufen.",
        )
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.role is not None:
        user.role = body.role
    if body.disabled is not None:
        user.disabled = body.disabled
        if body.disabled:
            end_sessions(db, user.id)
    if body.password is not None:
        user.password_hash = hash_password(body.password)
        end_sessions(db, user.id)
    if body.password is not None or body.disabled is False:
        user.failed_logins = 0
        user.failed_window_started_at = None
        user.locked_until = None
    db.flush()
    return UserOut.model_validate(user)
