"""DevFlow Harness — M3 full-role closed loop (todo demo)."""

from __future__ import annotations

from contextlib import asynccontextmanager

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from db import SessionLocal
from routers import auth, chat, conversations, files, organizations, shared
from seed import seed_permissions
from seed_organizations import seed_default_org


def run_migrations() -> None:
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    run_migrations()
    db = SessionLocal()
    try:
        seed_permissions(db)
        seed_default_org(db)
    finally:
        db.close()
    yield


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(conversations.router)
app.include_router(files.router)
app.include_router(shared.router)
app.include_router(chat.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
    }
