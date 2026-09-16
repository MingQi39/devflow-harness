"""FastAPI dependencies for auth and RBAC."""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from auth_utils import decode_access_token
from db import get_db
from models.permission import Permission, RolePermission
from models.user import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials], Depends(bearer_scheme)
    ],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    try:
        user_id, _role = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


def user_has_permission(db: Session, role: UserRole, code: str) -> bool:
    return (
        db.query(RolePermission)
        .join(Permission, RolePermission.permission_id == Permission.id)
        .filter(RolePermission.role == role, Permission.code == code)
        .first()
        is not None
    )


def get_user_permissions(db: Session, role: UserRole) -> list[str]:
    rows = (
        db.query(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .filter(RolePermission.role == role)
        .order_by(Permission.code)
        .all()
    )
    return [row[0] for row in rows]


def require_permission(code: str) -> Callable:
    def checker(
        user: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_db)],
    ) -> User:
        if not user_has_permission(db, user.role, code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied",
            )
        return user

    return checker
