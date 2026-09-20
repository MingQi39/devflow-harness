"""Seed default organization for local demo."""

from __future__ import annotations

from sqlalchemy.orm import Session

from services.organizations import ensure_default_organization


def seed_default_org(db: Session) -> None:
    ensure_default_organization(db)
