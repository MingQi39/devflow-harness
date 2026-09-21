"""Bind a dev project sandbox to an existing directory on disk (VS Code–style open folder)."""

from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from config import get_settings
from models.project import Project

class ProjectLocalBindError(ValueError):
    """Binding a local directory failed."""




def _workspaces_base() -> Path:
    root = Path(get_settings().workspaces_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _bind_file_for_project(project_id: uuid.UUID) -> Path:
    stub = _workspaces_base() / "projects" / str(project_id)
    return stub / ".devflow" / "local_root"


def read_bound_local_root(project_id: uuid.UUID) -> Path | None:
    """Return bound local directory when enabled and valid."""
    if not get_settings().allow_local_path_import:
        return None
    bind_file = _bind_file_for_project(project_id)
    if not bind_file.is_file():
        return None
    raw = bind_file.read_text(encoding="utf-8").strip()
    if not raw:
        return None
    local = Path(raw).expanduser().resolve()
    if not local.is_dir():
        return None
    return local


def bind_local_workspace(project_id: uuid.UUID, source_path: str) -> Path:
    """Record that this project edits ``source_path`` directly (no full-tree copy)."""
    if not get_settings().allow_local_path_import:
        raise ProjectLocalBindError(
            "本机目录绑定未启用：设置 ALLOW_LOCAL_PATH_IMPORT=true（仅本地/Electron）"
        )

    root = Path(source_path).expanduser().resolve()
    if not root.is_dir():
        raise ProjectLocalBindError("目录不存在或不是文件夹")

    workspace_resolved = (_workspaces_base() / "projects" / str(project_id)).resolve()
    try:
        root.relative_to(workspace_resolved)
        raise ProjectLocalBindError("不能绑定到平台沙箱目录本身")
    except ValueError:
        pass

    bind_file = _bind_file_for_project(project_id)
    bind_file.parent.mkdir(parents=True, exist_ok=True)
    bind_file.write_text(f"{root}\n", encoding="utf-8")
    return root


def list_owner_local_bindings(
    db: Session, *, owner_id: uuid.UUID, org_id: uuid.UUID
) -> list[dict[str, object]]:
    """Distinct local directories bound on the developer's projects (newest first)."""
    if not get_settings().allow_local_path_import:
        return []

    projects = (
        db.query(Project)
        .filter(Project.org_id == org_id, Project.owner_id == owner_id)
        .order_by(Project.updated_at.desc())
        .all()
    )
    seen: dict[str, dict[str, object]] = {}
    for project in projects:
        local = read_bound_local_root(project.id)
        if local is None:
            continue
        key = str(local)
        if key in seen:
            continue
        seen[key] = {
            "local_root": key,
            "label": project.title,
            "project_id": project.id,
            "updated_at": project.updated_at.isoformat(),
        }
    return list(seen.values())
