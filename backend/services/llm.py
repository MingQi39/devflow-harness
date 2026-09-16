"""OpenAI-compatible LLM client helpers."""

from __future__ import annotations

from fastapi import HTTPException
from openai import OpenAI

from config import get_settings


def get_llm_client() -> OpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")
    return OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)


def get_model() -> str:
    settings = get_settings()
    if not settings.model:
        raise HTTPException(status_code=500, detail="MODEL is not configured")
    return settings.model
