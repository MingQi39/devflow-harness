"""DevFlow Harness — M1: SSE streaming chat API."""

from __future__ import annotations

import json
import os
from typing import Iterator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel, Field

load_dotenv(override=True)

APP_NAME = "DevFlow Harness"
APP_VERSION = "0.1.0-m1"

app = FastAPI(title=APP_NAME, version=APP_VERSION)


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")
    return OpenAI(api_key=api_key, base_url=os.getenv("OPENAI_BASE_URL"))


def _model() -> str:
    model = os.getenv("MODEL", "deepseek-chat")
    if not model:
        raise HTTPException(status_code=500, detail="MODEL is not configured")
    return model


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant|system)$")
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=32000)
    history: list[ChatMessage] = Field(default_factory=list)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": APP_NAME, "version": APP_VERSION}


@app.post("/chat")
def chat(request: ChatRequest) -> dict[str, str]:
    messages = [{"role": m.role, "content": m.content} for m in request.history]
    messages.append({"role": "user", "content": request.message})

    try:
        response = _client().chat.completions.create(
            model=_model(),
            messages=messages,
        )
    except Exception as exc:  # noqa: BLE001 — surface provider errors to client
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    reply = response.choices[0].message.content or ""
    return {"reply": reply}


@app.post("/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    messages = [{"role": m.role, "content": m.content} for m in request.history]
    messages.append({"role": "user", "content": request.message})

    try:
        stream = _client().chat.completions.create(
            model=_model(),
            messages=messages,
            stream=True,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    def generate() -> Iterator[str]:
        try:
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield f"data: {json.dumps({'content': delta}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:  # noqa: BLE001
            payload = json.dumps({"error": str(exc)}, ensure_ascii=False)
            yield f"data: {payload}\n\n"
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
