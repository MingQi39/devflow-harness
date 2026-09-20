"""Multi-turn agent loop with read/write file tools."""

from __future__ import annotations

import json
import uuid
from collections.abc import Callable, Iterator
from datetime import datetime, timezone
from typing import Any

from openai import OpenAI
from sqlalchemy.orm import Session

from config import get_settings
from db import SessionLocal
from models.conversation import Conversation
from models.message import Message, MessageRole
from services.agent_tools import TOOL_DEFINITIONS, execute_tool
from services.session_stage import SessionStage, build_system_prompt
from services.workspace import ensure_workspace

ShouldStop = Callable[[], bool]


def build_api_messages(history: list[Message]) -> list[dict[str, Any]]:
    """Build LLM history, skipping broken assistant+tool_call turns."""
    api_messages: list[dict[str, Any]] = []
    index = 0
    while index < len(history):
        message = history[index]
        if message.role == MessageRole.assistant and message.tool_calls:
            expected_ids = {
                tool_call["id"]
                for tool_call in message.tool_calls
                if tool_call.get("id")
            }
            tool_messages: list[Message] = []
            cursor = index + 1
            while cursor < len(history) and history[cursor].role == MessageRole.tool:
                tool_messages.append(history[cursor])
                cursor += 1
            responded_ids = {
                tool_message.tool_call_id
                for tool_message in tool_messages
                if tool_message.tool_call_id
            }
            if expected_ids and expected_ids <= responded_ids:
                api_messages.append(message_to_api(message))
                for tool_message in tool_messages:
                    if tool_message.tool_call_id in expected_ids:
                        api_messages.append(message_to_api(tool_message))
            elif message.content.strip():
                api_messages.append({"role": "assistant", "content": message.content})
            index = cursor
            continue
        api_messages.append(message_to_api(message))
        index += 1
    return api_messages


def message_to_api(message: Message) -> dict[str, Any]:
    if message.role == MessageRole.tool:
        return {
            "role": "tool",
            "tool_call_id": message.tool_call_id or "",
            "content": message.content,
        }
    if message.role == MessageRole.assistant and message.tool_calls:
        return {
            "role": "assistant",
            "content": message.content or None,
            "tool_calls": message.tool_calls,
        }
    return {"role": message.role.value, "content": message.content}


def _accumulate_tool_calls(
    accumulated: dict[int, dict[str, Any]],
    delta_tool_calls: list[Any],
) -> None:
    for tool_call in delta_tool_calls:
        index = tool_call.index
        if index not in accumulated:
            accumulated[index] = {
                "id": "",
                "type": "function",
                "function": {"name": "", "arguments": ""},
            }
        current = accumulated[index]
        if tool_call.id:
            current["id"] = tool_call.id
        if tool_call.function and tool_call.function.name:
            current["function"]["name"] += tool_call.function.name
        if tool_call.function and tool_call.function.arguments:
            current["function"]["arguments"] += tool_call.function.arguments


def run_agent_loop(
    *,
    client: OpenAI,
    model: str,
    conversation_id: uuid.UUID,
    history: list[Message],
    user_message: str,
    should_stop: ShouldStop,
    stage: SessionStage = SessionStage.requirement,
) -> Iterator[dict[str, Any]]:
    settings = get_settings()
    workspace = ensure_workspace(conversation_id)
    api_messages: list[dict[str, Any]] = [
        {"role": "system", "content": build_system_prompt(stage)}
    ]
    api_messages.extend(build_api_messages(history))
    api_messages.append({"role": "user", "content": user_message})

    yield {"type": "started"}

    for _ in range(settings.agent_max_iterations):
        if should_stop():
            yield {"type": "stopped"}
            return

        stream = client.chat.completions.create(
            model=model,
            messages=api_messages,
            tools=TOOL_DEFINITIONS,
            stream=True,
        )

        assistant_text_parts: list[str] = []
        tool_calls_acc: dict[int, dict[str, Any]] = {}

        for chunk in stream:
            if should_stop():
                yield {"type": "stopped"}
                return

            delta = chunk.choices[0].delta
            if delta.content:
                assistant_text_parts.append(delta.content)
                yield {"type": "content", "content": delta.content}
            if delta.tool_calls:
                _accumulate_tool_calls(tool_calls_acc, delta.tool_calls)

        assistant_text = "".join(assistant_text_parts)
        ordered_tool_calls = [tool_calls_acc[index] for index in sorted(tool_calls_acc)]

        if ordered_tool_calls:
            api_messages.append(
                {
                    "role": "assistant",
                    "content": assistant_text or None,
                    "tool_calls": ordered_tool_calls,
                }
            )

            file_changed = False
            tool_results: list[tuple[dict[str, Any], str, str, bool]] = []
            for tool_call in ordered_tool_calls:
                if should_stop():
                    yield {"type": "stopped"}
                    return

                tool_name = tool_call["function"]["name"]
                arguments = tool_call["function"]["arguments"]
                yield {
                    "type": "tool_call",
                    "id": tool_call["id"],
                    "name": tool_name,
                    "arguments": arguments,
                }

                result, changed = execute_tool(workspace, tool_name, arguments)
                if changed:
                    file_changed = True

                yield {
                    "type": "tool_result",
                    "id": tool_call["id"],
                    "name": tool_name,
                    "result": result,
                }
                tool_results.append((tool_call, tool_name, result, changed))
                api_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "content": result,
                    }
                )

            _persist_tool_turn(
                conversation_id,
                assistant_text,
                ordered_tool_calls,
                tool_results,
            )

            if file_changed:
                yield {"type": "file_changed"}
            continue

        if assistant_text:
            _persist_assistant_message(conversation_id, assistant_text)
        yield {"type": "done"}
        return

    yield {
        "type": "error",
        "error": "Agent loop reached the maximum number of iterations",
    }
    yield {"type": "done"}


def _touch_conversation(db: Session, conversation_id: uuid.UUID) -> None:
    conversation = db.get(Conversation, conversation_id)
    if conversation is not None:
        conversation.updated_at = datetime.now(timezone.utc)


def _persist_assistant_message(conversation_id: uuid.UUID, content: str) -> None:
    db = SessionLocal()
    try:
        db.add(
            Message(
                conversation_id=conversation_id,
                role=MessageRole.assistant,
                content=content,
            )
        )
        _touch_conversation(db, conversation_id)
        db.commit()
    finally:
        db.close()


def _persist_tool_turn(
    conversation_id: uuid.UUID,
    content: str,
    tool_calls: list[dict[str, Any]],
    tool_results: list[tuple[dict[str, Any], str, str, bool]],
) -> None:
    db = SessionLocal()
    try:
        db.add(
            Message(
                conversation_id=conversation_id,
                role=MessageRole.assistant,
                content=content,
                tool_calls=tool_calls,
            )
        )
        for tool_call, tool_name, result, _changed in tool_results:
            db.add(
                Message(
                    conversation_id=conversation_id,
                    role=MessageRole.tool,
                    content=result,
                    tool_call_id=tool_call["id"],
                    tool_name=tool_name,
                )
            )
        _touch_conversation(db, conversation_id)
        db.commit()
    finally:
        db.close()


def persist_user_message(conversation_id: uuid.UUID, content: str) -> None:
    db = SessionLocal()
    try:
        db.add(
            Message(
                conversation_id=conversation_id,
                role=MessageRole.user,
                content=content,
            )
        )
        _touch_conversation(db, conversation_id)
        db.commit()
    finally:
        db.close()


def sse_encode(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def stream_agent_events(
    *,
    client: OpenAI,
    model: str,
    conversation_id: uuid.UUID,
    history: list[Message],
    user_message: str,
    should_stop: ShouldStop,
    stage: SessionStage = SessionStage.requirement,
) -> Iterator[str]:
    for event in run_agent_loop(
        client=client,
        model=model,
        conversation_id=conversation_id,
        history=history,
        user_message=user_message,
        should_stop=should_stop,
        stage=stage,
    ):
        yield sse_encode(event)
    yield "data: [DONE]\n\n"
