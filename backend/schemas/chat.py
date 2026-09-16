"""Chat request schemas."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class ChatStreamRequest(BaseModel):
    conversation_id: uuid.UUID
    message: str = Field(min_length=1, max_length=32000)
