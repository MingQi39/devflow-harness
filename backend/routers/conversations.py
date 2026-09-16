"""Conversation CRUD and sharing routes."""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from config import get_settings
from db import get_db
from deps import require_permission
from models.conversation import Conversation
from models.message import Message
from models.user import User
from schemas.conversation import (
    ConversationCreate,
    ConversationOut,
    ConversationUpdate,
    MessageOut,
    MessagesResponse,
    ShareCreateResponse,
    ShareStatusResponse,
)
from services.conversations import get_owned_conversation

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _share_url(token: str) -> str:
    base = get_settings().app_public_url.rstrip("/")
    return f"{base}/share/{token}"


@router.get("", response_model=list[ConversationOut])
def list_conversations(
    user: Annotated[User, Depends(require_permission("chat:read"))],
    db: Annotated[Session, Depends(get_db)],
) -> list[Conversation]:
    return (
        db.query(Conversation)
        .filter(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(
    body: ConversationCreate,
    user: Annotated[User, Depends(require_permission("conversation:manage"))],
    db: Annotated[Session, Depends(get_db)],
) -> Conversation:
    conversation = Conversation(
        user_id=user.id,
        title=body.title or "新对话",
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.patch("/{conversation_id}", response_model=ConversationOut)
def update_conversation(
    conversation_id: uuid.UUID,
    body: ConversationUpdate,
    user: Annotated[User, Depends(require_permission("conversation:manage"))],
    db: Annotated[Session, Depends(get_db)],
) -> Conversation:
    conversation = get_owned_conversation(db, user, conversation_id)
    conversation.title = body.title
    db.commit()
    db.refresh(conversation)
    return conversation


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("conversation:manage"))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    conversation = get_owned_conversation(db, user, conversation_id)
    db.delete(conversation)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{conversation_id}/messages", response_model=MessagesResponse)
def get_messages(
    conversation_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("chat:read"))],
    db: Annotated[Session, Depends(get_db)],
) -> MessagesResponse:
    get_owned_conversation(db, user, conversation_id)
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return MessagesResponse(messages=[MessageOut.model_validate(m) for m in messages])


@router.post("/{conversation_id}/share", response_model=ShareCreateResponse)
def enable_share(
    conversation_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("conversation:share"))],
    db: Annotated[Session, Depends(get_db)],
) -> ShareCreateResponse:
    conversation = get_owned_conversation(db, user, conversation_id)
    if conversation.share_token is None:
        conversation.share_token = secrets.token_urlsafe(24)
        conversation.shared_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(conversation)
    return ShareCreateResponse(
        share_url=_share_url(conversation.share_token),
        share_token=conversation.share_token,
    )


@router.get("/{conversation_id}/share", response_model=ShareStatusResponse)
def get_share_status(
    conversation_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("conversation:share"))],
    db: Annotated[Session, Depends(get_db)],
) -> ShareStatusResponse:
    conversation = get_owned_conversation(db, user, conversation_id)
    if conversation.share_token is None:
        return ShareStatusResponse(shared=False)
    return ShareStatusResponse(
        shared=True,
        share_url=_share_url(conversation.share_token),
        share_token=conversation.share_token,
    )


@router.delete("/{conversation_id}/share", status_code=status.HTTP_204_NO_CONTENT)
def disable_share(
    conversation_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("conversation:share"))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    conversation = get_owned_conversation(db, user, conversation_id)
    conversation.share_token = None
    conversation.shared_at = None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
