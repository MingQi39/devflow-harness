"""Streaming chat route."""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from db import SessionLocal, get_db
from deps import require_permission
from models.conversation import Conversation
from models.message import Message, MessageRole
from models.user import User
from schemas.chat import ChatStreamRequest
from services.conversations import get_owned_conversation
from services.llm import get_llm_client, get_model

router = APIRouter(tags=["chat"])


@router.post("/chat/stream")
def chat_stream(
    body: ChatStreamRequest,
    user: Annotated[User, Depends(require_permission("chat:write"))],
    db: Annotated[Session, Depends(get_db)],
) -> StreamingResponse:
    conversation = get_owned_conversation(db, user, body.conversation_id)
    history = (
        db.query(Message)
        .filter(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.asc())
        .all()
    )
    messages = [{"role": m.role.value, "content": m.content} for m in history]
    messages.append({"role": "user", "content": body.message})

    stream = get_llm_client().chat.completions.create(
        model=get_model(),
        messages=messages,
        stream=True,
    )

    conversation_id = conversation.id
    user_message_text = body.message
    _persist_user_message(conversation_id, user_message_text)

    def generate() -> Iterator[str]:
        assistant_parts: list[str] = []
        try:
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    assistant_parts.append(delta)
                    yield f"data: {json.dumps({'content': delta}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:  # noqa: BLE001
            payload = json.dumps({"error": str(exc)}, ensure_ascii=False)
            yield f"data: {payload}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            assistant_text = "".join(assistant_parts)
            if assistant_text:
                _persist_assistant_message(conversation_id, assistant_text)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _persist_user_message(conversation_id, user_message_text: str) -> None:
    db = SessionLocal()
    try:
        conversation = db.get(Conversation, conversation_id)
        if conversation is None:
            return
        db.add(
            Message(
                conversation_id=conversation_id,
                role=MessageRole.user,
                content=user_message_text,
            )
        )
        conversation.updated_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


def _persist_assistant_message(conversation_id, assistant_text: str) -> None:
    db = SessionLocal()
    try:
        conversation = db.get(Conversation, conversation_id)
        if conversation is None:
            return
        db.add(
            Message(
                conversation_id=conversation_id,
                role=MessageRole.assistant,
                content=assistant_text,
            )
        )
        conversation.updated_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()
