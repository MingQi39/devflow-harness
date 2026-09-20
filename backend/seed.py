"""Seed RBAC permissions and role mappings."""

from __future__ import annotations

from sqlalchemy.orm import Session

from models.permission import Permission, RolePermission
from models.user import UserRole

PERMISSIONS: list[tuple[str, str]] = [
    ("chat:read", "Read chat messages"),
    ("chat:write", "Send chat messages"),
    ("conversation:manage", "Create and manage conversations"),
    ("conversation:share", "Share conversations via public link"),
    ("org:read", "View organization and contacts"),
    ("org:create", "Create a new organization"),
    ("org:manage", "Manage organization settings"),
    ("prototype:send", "Send prototype to developers"),
    ("prototype:receive", "Receive prototype deliveries"),
    ("pm:manage_requirements", "Manage product requirements (M6)"),
    ("dev:write_code", "Write and edit code (M4)"),
    ("qa:run_tests", "Run QA tests (M7)"),
]

ROLE_PERMISSIONS: dict[UserRole, list[str]] = {
    UserRole.pm: [
        "chat:read",
        "chat:write",
        "conversation:manage",
        "conversation:share",
        "org:read",
        "org:create",
        "org:manage",
        "prototype:send",
        "pm:manage_requirements",
    ],
    UserRole.frontend: [
        "chat:read",
        "chat:write",
        "conversation:manage",
        "conversation:share",
        "org:read",
        "org:create",
        "prototype:receive",
        "dev:write_code",
    ],
    UserRole.backend: [
        "chat:read",
        "chat:write",
        "conversation:manage",
        "conversation:share",
        "org:read",
        "org:create",
        "prototype:receive",
        "dev:write_code",
    ],
    UserRole.qa: [
        "chat:read",
        "chat:write",
        "conversation:manage",
        "conversation:share",
        "org:read",
        "org:create",
        "qa:run_tests",
    ],
}


def seed_permissions(db: Session) -> None:
    code_to_id: dict[str, Permission] = {}
    for code, description in PERMISSIONS:
        perm = db.query(Permission).filter(Permission.code == code).first()
        if perm is None:
            perm = Permission(code=code, description=description)
            db.add(perm)
            db.flush()
        code_to_id[code] = perm

    for role, codes in ROLE_PERMISSIONS.items():
        for code in codes:
            perm = code_to_id[code]
            exists = (
                db.query(RolePermission)
                .filter(
                    RolePermission.role == role,
                    RolePermission.permission_id == perm.id,
                )
                .first()
            )
            if exists is None:
                db.add(RolePermission(role=role, permission_id=perm.id))

    db.commit()
