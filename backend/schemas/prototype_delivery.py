"""Prototype delivery schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class PrototypeDeliveryCreate(BaseModel):
    conversation_id: uuid.UUID
    recipient_user_ids: list[uuid.UUID] = Field(min_length=1, max_length=20)
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(default="", max_length=2000)


class PrototypeDeliveryOut(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    conversation_id: uuid.UUID
    sender_id: uuid.UUID
    recipient_id: uuid.UUID
    sender_email: str | None = None
    recipient_email: str | None = None
    title: str
    message: str
    read_at: datetime | None
    dev_project_id: uuid.UUID | None = None
    dev_conversation_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DeliveryFileOut(BaseModel):
    path: str
    content: str
