"""Streaming chat route with agent loop."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from db import get_db
from deps import require_permission
from models.message import Message
from models.user import User
from schemas.chat import ChatStreamRequest
from services.agent_loop import persist_user_message, stream_agent_events
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

    conversation_id = conversation.id
    conversation_stage = conversation.stage
    user_message_text = body.message
    persist_user_message(conversation_id, user_message_text)

    client = get_llm_client()
    model = get_model()

    def generate() -> Iterator[str]:
        # 同步 StreamingResponse 下 request.is_disconnected 会持续误报，不能用于停止检测。
        # 客户端 AbortController 断开时会触发 GeneratorExit。
        try:
            yield ": connected\n\n"
            yield from stream_agent_events(
                client=client,
                model=model,
                conversation_id=conversation_id,
                history=history,
                user_message=user_message_text,
                should_stop=lambda: False,
                stage=conversation_stage,
            )
        except GeneratorExit:
            return
        except Exception as exc:  # noqa: BLE001
            from services.agent_loop import sse_encode

            yield sse_encode({"type": "error", "error": str(exc)})
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
