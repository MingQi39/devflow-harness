"""Bootstrap a project sandbox from a prototype delivery."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from models.conversation import Conversation
from models.project import Project
from models.prototype_delivery import PrototypeDelivery
from models.user import User, UserRole
from schemas.dev_project import DevProjectOriginMode, StackRecommendation
from services.prototype_delivery import (
    DeliveryError,
    get_delivery_for_user,
    read_delivery_file,
)
from services.session_stage import SessionStage
from config import get_settings
from services.project_local_bind import ProjectLocalBindError, bind_local_workspace
from services.stack_templates import apply_stack_templates
from services.workspace import ensure_project_workspace, write_file

_PROJECT_MANIFEST = ".devflow/project.json"


class DevProjectError(ValueError):
    """Developer project bootstrap failed."""


def _copy_delivery_into_docs(delivery_id: uuid.UUID, workspace: Path) -> None:
    for name in ("prototype.html", "REQUIREMENTS.md"):
        try:
            content = read_delivery_file(delivery_id, name)
        except DeliveryError:
            if name == "prototype.html":
                raise DevProjectError("Delivery snapshot missing prototype.html") from None
            continue
        write_file(workspace, f"docs/{name}", content)


def _delivery_reference_root(project_id: uuid.UUID) -> Path:
    root = Path(get_settings().workspaces_root).resolve()
    return root / "projects" / str(project_id) / "_delivery_ref"


def materialize_delivery_docs(
    project_id: uuid.UUID,
    delivery_id: uuid.UUID,
    workspace: Path,
) -> None:
    """PM 原型/需求快照：本地绑定时只存平台侧，不写入用户仓库。"""
    from services.project_local_bind import read_bound_local_root

    if read_bound_local_root(project_id) is not None:
        ref_root = _delivery_reference_root(project_id)
        ref_root.mkdir(parents=True, exist_ok=True)
        _copy_delivery_into_docs(delivery_id, ref_root)
        return
    _copy_delivery_into_docs(delivery_id, workspace)


def _write_project_manifest(
    workspace: Path,
    *,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
    title: str,
    delivery_id: uuid.UUID,
    owner_id: uuid.UUID,
    origin_mode: DevProjectOriginMode,
    prompt: str | None,
    stack: StackRecommendation | None,
    stack_id: str | None,
) -> None:
    origin: dict[str, Any] = {"mode": origin_mode}
    if prompt:
        origin["prompt"] = prompt.strip()
    if stack is not None:
        origin["stack"] = stack.model_dump()
    payload = {
        "schema_version": 2,
        "project_id": str(project_id),
        "title": title,
        "stack_id": stack_id,
        "org_id": str(org_id),
        "owner_id": str(owner_id),
        "source_delivery_id": str(delivery_id),
        "origin": origin,
        "layout": {
            "docs": "docs",
            "frontend": "frontend",
            "backend": "backend",
            "manifest": _PROJECT_MANIFEST,
        },
        "runtime": {
            "status": "idle",
            "note": "M4+ will start dev servers inside this sandbox",
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    write_file(workspace, _PROJECT_MANIFEST, json.dumps(payload, ensure_ascii=False, indent=2))


def _load_primary_conversation(db: Session, project: Project) -> Conversation | None:
    if project.primary_conversation_id is None:
        return None
    return (
        db.query(Conversation)
        .filter(
            Conversation.id == project.primary_conversation_id,
            Conversation.user_id == project.owner_id,
        )
        .first()
    )


def bootstrap_dev_project_from_delivery(
    db: Session,
    *,
    org_id: uuid.UUID,
    delivery_id: uuid.UUID,
    developer: User,
    title: str | None = None,
    mode: DevProjectOriginMode = "greenfield",
    prompt: str | None = None,
    stack: StackRecommendation | None = None,
    source_path: str | None = None,
) -> tuple[Project, Conversation, bool, int | None]:
    """Return (project, primary conversation, created, files_imported). Idempotent per delivery."""
    if developer.role not in {UserRole.frontend, UserRole.backend}:
        raise DevProjectError("Only frontend or backend roles can bootstrap dev projects")

    if mode == "greenfield" and (not prompt or stack is None):
        raise DevProjectError("greenfield 需要先填写描述并完成技术栈分析")

    delivery = get_delivery_for_user(db, developer, org_id, delivery_id)
    if delivery.recipient_id != developer.id:
        raise DevProjectError("Only the delivery recipient can create a dev project")

    if delivery.dev_project_id is not None:
        project = db.query(Project).filter(Project.id == delivery.dev_project_id).first()
        if project is not None:
            conversation = _load_primary_conversation(db, project)
            if conversation is not None:
                return project, conversation, False, None
        delivery.dev_project_id = None
        db.flush()

    session_title = (title or delivery.title or "开发项目").strip()[:200]
    project = Project(
        org_id=org_id,
        owner_id=developer.id,
        source_delivery_id=delivery.id,
        title=session_title or "开发项目",
    )
    db.add(project)
    db.flush()

    conversation = Conversation(
        user_id=developer.id,
        project_id=project.id,
        title=session_title or "开发项目",
        stage=SessionStage.development,
    )
    db.add(conversation)
    db.flush()

    project.primary_conversation_id = conversation.id
    delivery.dev_project_id = project.id

    effective_stack_id: str | None = None
    files_imported: int | None = None
    trimmed_source = (source_path or "").strip()

    if mode == "import" and trimmed_source and get_settings().allow_local_path_import:
        try:
            bind_local_workspace(project.id, trimmed_source)
            workspace = ensure_project_workspace(project.id)
            materialize_delivery_docs(project.id, delivery.id, workspace)
            files_imported = 0
        except ProjectLocalBindError as exc:
            raise DevProjectError(str(exc)) from exc
    else:
        workspace = ensure_project_workspace(project.id)
        materialize_delivery_docs(project.id, delivery.id, workspace)
        if mode == "greenfield" and stack is not None:
            effective_stack_id = apply_stack_templates(workspace, stack.stack_id)
        elif mode == "import":
            write_file(
                workspace,
                "IMPORT.md",
                "# 本地项目导入\n\n请绑定本地目录或上传 ZIP。\n",
            )

    workspace = ensure_project_workspace(project.id)
    _write_project_manifest(
        workspace,
        project_id=project.id,
        org_id=org_id,
        title=project.title,
        delivery_id=delivery.id,
        owner_id=developer.id,
        origin_mode=mode,
        prompt=prompt,
        stack=stack,
        stack_id=effective_stack_id,
    )

    db.commit()
    db.refresh(project)
    db.refresh(conversation)
    db.refresh(delivery)
    return project, conversation, True, files_imported
