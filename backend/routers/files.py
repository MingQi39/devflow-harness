"""Session workspace file routes."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from db import get_db
from deps import require_permission
from models.user import User
from schemas.files import FileContentResponse, FileTreeNode, FileTreeResponse
from services.conversations import get_owned_conversation
from services.conversation_workspace import workspace_for_conversation
from services.workspace import (
    WorkspaceError,
    build_prototype_handoff_zip,
    build_tree,
    read_file,
)

router = APIRouter(prefix="/conversations", tags=["files"])


@router.get("/{conversation_id}/files", response_model=FileTreeResponse)
def list_files(
    conversation_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("chat:read"))],
    db: Annotated[Session, Depends(get_db)],
) -> FileTreeResponse:
    get_owned_conversation(db, user, conversation_id)
    workspace = workspace_for_conversation(db, conversation_id)
    tree = [FileTreeNode.model_validate(node) for node in build_tree(workspace)]
    return FileTreeResponse(tree=tree)


@router.get("/{conversation_id}/files/content", response_model=FileContentResponse)
def get_file_content(
    conversation_id: uuid.UUID,
    path: Annotated[str, Query(min_length=1, max_length=512)],
    user: Annotated[User, Depends(require_permission("chat:read"))],
    db: Annotated[Session, Depends(get_db)],
) -> FileContentResponse:
    get_owned_conversation(db, user, conversation_id)
    workspace = workspace_for_conversation(db, conversation_id)
    try:
        content = read_file(workspace, path)
    except WorkspaceError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return FileContentResponse(path=path, content=content)


@router.get("/{conversation_id}/files/export/prototype")
def export_prototype_handoff(
    conversation_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("chat:read"))],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    """ZIP bundle for PM → dev handoff (prototype + requirements)."""
    get_owned_conversation(db, user, conversation_id)
    workspace = workspace_for_conversation(db, conversation_id)
    try:
        payload = build_prototype_handoff_zip(workspace)
    except WorkspaceError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    filename = f"prototype-handoff-{conversation_id}.zip"
    return Response(
        content=payload,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
