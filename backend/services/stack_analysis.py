"""Recommend frontend/backend stack from developer prompt (+ optional PM requirements)."""

from __future__ import annotations

import json
import re

from fastapi import HTTPException
from openai import OpenAI

from schemas.dev_project import StackRecommendation
from services.llm import get_llm_client, get_model

_KNOWN_STACKS: dict[str, tuple[str, str]] = {
    "react-vite-fastapi": ("React 18 + Vite", "FastAPI (Python)"),
    "vue-vite-fastapi": ("Vue 3 + Vite", "FastAPI (Python)"),
    "nextjs-fastapi": ("Next.js (App Router)", "FastAPI (Python)"),
    "static-html-fastapi": ("静态 HTML + 原生 JS", "FastAPI (Python)"),
}

_DEFAULT_STACK_ID = "static-html-fastapi"


def _fallback_analyze(prompt: str, requirements_hint: str) -> StackRecommendation:
    text = f"{prompt}\n{requirements_hint}".lower()
    if "next.js" in text or "nextjs" in text:
        stack_id = "nextjs-fastapi"
    elif "vue" in text:
        stack_id = "vue-vite-fastapi"
    elif "react" in text or "tsx" in text:
        stack_id = "react-vite-fastapi"
    else:
        stack_id = _DEFAULT_STACK_ID
    fe, be = _KNOWN_STACKS[stack_id]
    return StackRecommendation(
        stack_id=stack_id,
        frontend=fe,
        backend=be,
        rationale="基于关键词的本地推荐（未调用 LLM 或 LLM 不可用）。",
        summary=f"建议使用 {fe} 与 {be}。",
    )


def _parse_llm_json(raw: str) -> StackRecommendation | None:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    stack_id = str(data.get("stack_id", "")).strip()
    if stack_id not in _KNOWN_STACKS:
        stack_id = _DEFAULT_STACK_ID
    fe, be = _KNOWN_STACKS[stack_id]
    return StackRecommendation(
        stack_id=stack_id,
        frontend=str(data.get("frontend") or fe)[:120],
        backend=str(data.get("backend") or be)[:120],
        rationale=str(data.get("rationale") or "")[:2000],
        summary=str(data.get("summary") or "")[:500],
    )


def analyze_stack(
    *,
    prompt: str,
    requirements_hint: str = "",
) -> tuple[StackRecommendation, bool]:
    """Return (recommendation, used_llm)."""
    try:
        client: OpenAI = get_llm_client()
        model = get_model()
    except HTTPException:
        return _fallback_analyze(prompt, requirements_hint), False

    system = (
        "You are a staff engineer picking a minimal tech stack for a small product demo. "
        "Reply with JSON only, no markdown. Fields: stack_id (one of "
        + ", ".join(_KNOWN_STACKS.keys())
        + "), frontend, backend, rationale (Chinese), summary (Chinese one line). "
        "Prefer simple stacks for todo/CRUD demos. Match the user's language in rationale/summary."
    )
    user = (
        f"Developer prompt:\n{prompt.strip()}\n\n"
        f"PM requirements excerpt:\n{requirements_hint.strip() or '(none)'}"
    )
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
        )
        content = completion.choices[0].message.content or ""
        parsed = _parse_llm_json(content)
        if parsed is not None:
            return parsed, True
    except Exception:
        pass
    return _fallback_analyze(prompt, requirements_hint), False
