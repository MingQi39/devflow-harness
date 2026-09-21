"""Access checks for project sandboxes."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.project import Project
from models.user import User
from services.organizations import require_org_member


def get_owned_project(
    db: Session, user: User, org_id: uuid.UUID, project_id: uuid.UUID
) -> Project:
    require_org_member(db, user.id, org_id)
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.org_id == org_id)
        .first()
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
    return project
