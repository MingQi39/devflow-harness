"""Authentication routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from auth_utils import create_access_token, hash_password, verify_password
from db import get_db
from deps import get_current_user, get_user_permissions
from models.user import User
from services.organizations import find_organization_by_invite, join_organization_by_invite
from schemas.auth import AuthResponse, LoginRequest, MeResponse, RegisterRequest, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_response(db: Session, user: User) -> AuthResponse:
    permissions = get_user_permissions(db, user.role)
    token = create_access_token(user.id, user.role)
    return AuthResponse(
        token=token,
        user=UserOut.model_validate(user),
        permissions=permissions,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    db: Annotated[Session, Depends(get_db)],
) -> AuthResponse:
    existing = db.query(User).filter(User.email == body.email.lower()).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    if body.invite_code and find_organization_by_invite(db, body.invite_code) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite code not found or invalid",
        )

    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if body.invite_code:
        join_organization_by_invite(db, user, body.invite_code)
    return _auth_response(db, user)


@router.post("/login", response_model=AuthResponse)
def login(
    body: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
) -> AuthResponse:
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return _auth_response(db, user)


@router.get("/me", response_model=MeResponse)
def me(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MeResponse:
    return MeResponse(
        user=UserOut.model_validate(user),
        permissions=get_user_permissions(db, user.role),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)
