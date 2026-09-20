"""Organization API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from models.organization import OrgMembershipRole
from models.user import UserRole


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)


class OrganizationJoin(BaseModel):
    invite_code: str = Field(min_length=6, max_length=32)


class OrganizationOut(BaseModel):
    id: uuid.UUID
    name: str
    invite_code: str
    member_count: int = 0
    membership_role: OrgMembershipRole | None = None

    model_config = {"from_attributes": True}


class OrgMemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    role: UserRole
    membership_role: OrgMembershipRole
    joined_at: datetime

    model_config = {"from_attributes": True}


class InviteCodeOut(BaseModel):
    invite_code: str
