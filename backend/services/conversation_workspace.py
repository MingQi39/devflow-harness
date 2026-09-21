"""Resolve on-disk workspace for a conversation (PM session vs project sandbox)."""

from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from models.conversation import Conversation
from services.workspace import ensure_project_workspace, ensure_workspace


def workspace_for_conversation(db: Session, conversation_id: uuid.UUID) -> Path:
    conversation = db.get(Conversation, conversation_id)
    if conversation is not None and conversation.project_id is not None:
        return ensure_project_workspace(conversation.project_id)
    return ensure_workspace(conversation_id)


def remove_storage_for_conversation(db: Session, conversation: Conversation) -> None:
    """Drop on-disk files only for legacy PM sessions; project sandboxes outlive one chat."""
    from services.workspace import remove_project_workspace, remove_workspace

    if conversation.project_id is not None:
        return
    remove_workspace(conversation.id)
