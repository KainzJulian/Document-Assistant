"""Pydantic models for login and user management."""

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Role = Literal["admin", "member"]

_strict = ConfigDict(strict=True, extra="forbid")


class LoginRequest(BaseModel):
    """Body of ``POST /auth/login``."""

    model_config = _strict

    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class UserOut(BaseModel):
    """A user as returned by the API; never contains the password hash."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    display_name: str
    role: Role
    disabled: bool


class UserCreate(BaseModel):
    """Body of ``POST /users``."""

    model_config = _strict

    username: str = Field(min_length=1, max_length=64)
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=256)
    role: Role = "member"


class UserPatch(BaseModel):
    """Body of ``PATCH /users/{id}``; only given fields change."""

    model_config = _strict

    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    role: Role | None = None
    disabled: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=256)
