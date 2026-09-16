"""Public read-only shared conversation routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from db import get_db
from models.conversation import Conversation
from models.message import Message
from schemas.conversation import MessageOut, MessagesResponse, SharedConversationOut

router = APIRouter(prefix="/shared", tags=["shared"])


def _get_shared_conversation(db: Session, share_token: str) -> Conversation:
    conversation = (
        db.query(Conversation)
        .filter(Conversation.share_token == share_token)
        .first()
    )
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared conversation not found",
        )
    return conversation


@router.get("/{share_token}", response_model=SharedConversationOut)
def get_shared_conversation(
    share_token: str,
    db: Annotated[Session, Depends(get_db)],
) -> SharedConversationOut:
    conversation = _get_shared_conversation(db, share_token)
    message_count = (
        db.query(Message)
        .filter(Message.conversation_id == conversation.id)
        .count()
    )
    if conversation.shared_at is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared conversation not found",
        )
    return SharedConversationOut(
        title=conversation.title,
        message_count=message_count,
        shared_at=conversation.shared_at,
    )


@router.get("/{share_token}/messages", response_model=MessagesResponse)
def get_shared_messages(
    share_token: str,
    db: Annotated[Session, Depends(get_db)],
) -> MessagesResponse:
    conversation = _get_shared_conversation(db, share_token)
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return MessagesResponse(messages=[MessageOut.model_validate(m) for m in messages])
