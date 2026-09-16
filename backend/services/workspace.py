"""Session workspace directory helpers."""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Any

from config import get_settings


class WorkspaceError(Exception):
    """Raised when a workspace path operation is invalid."""


def get_workspace_root(conversation_id: uuid.UUID) -> Path:
    settings = get_settings()
    root = Path(settings.workspaces_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    workspace = root / str(conversation_id)
    workspace.mkdir(parents=True, exist_ok=True)
    return workspace


def ensure_workspace(conversation_id: uuid.UUID) -> Path:
    workspace = get_workspace_root(conversation_id)
    workspace.mkdir(parents=True, exist_ok=True)
    return workspace


def remove_workspace(conversation_id: uuid.UUID) -> None:
    workspace = get_workspace_root(conversation_id)
    if workspace.exists():
        shutil.rmtree(workspace)


def safe_resolve(workspace: Path, relative_path: str) -> Path:
    clean = relative_path.strip().replace("\\", "/").lstrip("/")
    if not clean:
        raise WorkspaceError("Path is required")
    if Path(clean).is_absolute():
        raise WorkspaceError("Absolute paths are not allowed")
    if ".." in Path(clean).parts:
        raise WorkspaceError("Path traversal is not allowed")

    target = (workspace / clean).resolve()
    root = workspace.resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise WorkspaceError("Path is outside the session workspace") from exc
    return target


def read_file(workspace: Path, relative_path: str) -> str:
    target = safe_resolve(workspace, relative_path)
    if not target.exists():
        raise WorkspaceError(f"File not found: {relative_path}")
    if not target.is_file():
        raise WorkspaceError(f"Not a file: {relative_path}")
    return target.read_text(encoding="utf-8")


def write_file(workspace: Path, relative_path: str, content: str) -> None:
    target = safe_resolve(workspace, relative_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def build_tree(workspace: Path) -> list[dict[str, Any]]:
    if not workspace.exists():
        return []

    def walk(directory: Path) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for entry in sorted(
            directory.iterdir(),
            key=lambda item: (not item.is_dir(), item.name.lower()),
        ):
            if entry.name.startswith("."):
                continue
            rel = entry.relative_to(workspace).as_posix()
            if entry.is_dir():
                items.append(
                    {
                        "name": entry.name,
                        "path": rel,
                        "type": "dir",
                        "children": walk(entry),
                    }
                )
            else:
                items.append({"name": entry.name, "path": rel, "type": "file"})
        return items

    return walk(workspace)
