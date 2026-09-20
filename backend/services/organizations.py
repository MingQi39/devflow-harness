"""Organization membership helpers."""

from __future__ import annotations

import re
import secrets
import uuid

from sqlalchemy.orm import Session

from models.organization import OrgMember, OrgMembershipRole, Organization
from models.user import User, UserRole

INVITE_CODE_PATTERN = re.compile(r"^[A-Za-z0-9]{6,32}$")
DEFAULT_ORG_NAME = "DevFlow 演示组织"
DEFAULT_ORG_INVITE = "DEVFLOW1"

DEV_RECIPIENT_ROLES = {UserRole.frontend, UserRole.backend}


class OrgError(ValueError):
    """Organization operation failed."""


def normalize_invite_code(raw: str) -> str:
    return raw.strip().upper()


def generate_invite_code() -> str:
    return secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8].upper()


def ensure_default_organization(db: Session) -> Organization:
    org = db.query(Organization).filter(Organization.invite_code == DEFAULT_ORG_INVITE).first()
    if org is not None:
        return org
    org = Organization(name=DEFAULT_ORG_NAME, invite_code=DEFAULT_ORG_INVITE)
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def get_user_org_membership(
    db: Session, user_id: uuid.UUID, org_id: uuid.UUID
) -> OrgMember | None:
    return (
        db.query(OrgMember)
        .filter(OrgMember.user_id == user_id, OrgMember.org_id == org_id)
        .first()
    )


def require_org_member(db: Session, user_id: uuid.UUID, org_id: uuid.UUID) -> OrgMember:
    member = get_user_org_membership(db, user_id, org_id)
    if member is None:
        raise OrgError("Not a member of this organization")
    return member


def list_user_organizations(db: Session, user_id: uuid.UUID) -> list[Organization]:
    return (
        db.query(Organization)
        .join(OrgMember, OrgMember.org_id == Organization.id)
        .filter(OrgMember.user_id == user_id)
        .order_by(Organization.name.asc())
        .all()
    )


def find_organization_by_invite(db: Session, invite_code: str) -> Organization | None:
    code = normalize_invite_code(invite_code)
    if not INVITE_CODE_PATTERN.match(code):
        return None
    return db.query(Organization).filter(Organization.invite_code == code).first()


def join_organization_by_invite(db: Session, user: User, invite_code: str) -> Organization:
    org = find_organization_by_invite(db, invite_code)
    if org is None:
        raise OrgError("Invite code not found or invalid")
    existing = get_user_org_membership(db, user.id, org.id)
    if existing is not None:
        return org
    db.add(
        OrgMember(
            org_id=org.id,
            user_id=user.id,
            membership_role=OrgMembershipRole.member,
        )
    )
    db.commit()
    db.refresh(org)
    return org


def create_organization(db: Session, user: User, name: str) -> Organization:
    title = name.strip()
    if len(title) < 2:
        raise OrgError("Organization name is too short")
    org = Organization(name=title, invite_code=generate_invite_code())
    db.add(org)
    db.flush()
    db.add(
        OrgMember(
            org_id=org.id,
            user_id=user.id,
            membership_role=OrgMembershipRole.owner,
        )
    )
    db.commit()
    db.refresh(org)
    return org


def list_org_members(db: Session, org_id: uuid.UUID) -> list[tuple[OrgMember, User]]:
    rows = (
        db.query(OrgMember, User)
        .join(User, User.id == OrgMember.user_id)
        .filter(OrgMember.org_id == org_id)
        .order_by(User.role.asc(), User.email.asc())
        .all()
    )
    return list(rows)
