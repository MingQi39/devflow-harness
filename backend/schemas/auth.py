"""Auth request/response schemas."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr, Field

from models.user import UserRole


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    role: UserRole

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    token: str
    user: UserOut
    permissions: list[str]


class MeResponse(BaseModel):
    user: UserOut
    permissions: list[str]
