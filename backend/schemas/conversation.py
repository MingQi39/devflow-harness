"""Conversation and message schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from models.message import MessageRole
from services.session_stage import SessionStage


class ConversationCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)


class ConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ConversationStageUpdate(BaseModel):
    stage: SessionStage


class ConversationOut(BaseModel):
    id: uuid.UUID
    title: str
    project_id: uuid.UUID | None = None
    stage: SessionStage
    share_token: Optional[str]
    shared_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: uuid.UUID
    role: MessageRole
    content: str
    tool_calls: Optional[list[dict[str, Any]]] = None
    tool_call_id: Optional[str] = None
    tool_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MessagesResponse(BaseModel):
    messages: list[MessageOut]


class ShareStatusResponse(BaseModel):
    shared: bool
    share_url: Optional[str] = None
    share_token: Optional[str] = None


class ShareCreateResponse(BaseModel):
    share_url: str
    share_token: str


class SharedConversationOut(BaseModel):
    title: str
    message_count: int
    shared_at: datetime
