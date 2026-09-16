"""Application settings from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import List, Optional

from dotenv import load_dotenv

load_dotenv(override=True)


class Settings:
    app_name: str = "DevFlow Harness"
    app_version: str = "0.3.0-m2-session"

    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://devflow:devflow@localhost:5432/devflow",
    )
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-change-me-in-production")
    jwt_expire_days: int = int(os.getenv("JWT_EXPIRE_DAYS", "7"))
    jwt_algorithm: str = "HS256"

    openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")
    openai_base_url: Optional[str] = os.getenv("OPENAI_BASE_URL")
    model: str = os.getenv("MODEL", "deepseek-chat")

    cors_origins: List[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ]

    app_public_url: str = os.getenv("APP_PUBLIC_URL", "http://localhost:5173")
    workspaces_root: str = os.getenv("WORKSPACES_ROOT", "./workspaces")
    agent_max_iterations: int = int(os.getenv("AGENT_MAX_ITERATIONS", "12"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
