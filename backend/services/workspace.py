"""Session workspace directory helpers."""

from __future__ import annotations

import io
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Any

from config import get_settings


class WorkspaceError(Exception):
    """Raised when a workspace path operation is invalid."""


def _workspaces_base() -> Path:
    settings = get_settings()
    root = Path(settings.workspaces_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def get_workspace_root(conversation_id: uuid.UUID) -> Path:
    """Legacy PM / solo session directory keyed by conversation id."""
    workspace = _workspaces_base() / str(conversation_id)
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


def get_project_workspace_root(project_id: uuid.UUID) -> Path:
    """Project sandbox root — local bind when set, else under workspaces/projects/."""
    from services.project_local_bind import read_bound_local_root

    bound = read_bound_local_root(project_id)
    if bound is not None:
        return bound
    workspace = _workspaces_base() / "projects" / str(project_id)
    workspace.mkdir(parents=True, exist_ok=True)
    return workspace


def ensure_project_workspace(project_id: uuid.UUID) -> Path:
    workspace = get_project_workspace_root(project_id)
    workspace.mkdir(parents=True, exist_ok=True)
    return workspace


def remove_project_workspace(project_id: uuid.UUID) -> None:
    workspace = get_project_workspace_root(project_id)
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


PROTOTYPE_HANDOFF_FILES: tuple[str, ...] = ("prototype.html", "REQUIREMENTS.md")

HANDOFF_README = """DevFlow Harness — 原型交付包

- prototype.html：可双击在浏览器打开的可点击原型
- REQUIREMENTS.md：需求说明

开发同学请据此实现 index.html，勿覆盖本包内的 prototype.html。
"""


def build_prototype_handoff_zip(workspace: Path) -> bytes:
    """Zip prototype.html (required) and REQUIREMENTS.md when present."""
    try:
        prototype_content = read_file(workspace, "prototype.html")
    except WorkspaceError as exc:
        raise WorkspaceError("prototype.html not found in workspace") from exc

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("prototype.html", prototype_content)
        for name in PROTOTYPE_HANDOFF_FILES:
            if name == "prototype.html":
                continue
            try:
                archive.writestr(name, read_file(workspace, name))
            except WorkspaceError:
                continue
        archive.writestr("README.txt", HANDOFF_README)
    return buffer.getvalue()


def write_file(workspace: Path, relative_path: str, content: str) -> None:
    target = safe_resolve(workspace, relative_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def format_dir_listing(
    workspace: Path,
    relative_path: str = "",
    *,
    max_depth: int = 2,
) -> str:
    """Text listing for agents; skips heavy dependency dirs."""
    from services.project_import_skip import IMPORT_SKIP_DIR_NAMES

    clean = relative_path.strip().replace("\\", "/")
    if clean in ("", "."):
        base = workspace.resolve()
    else:
        base = safe_resolve(workspace, clean)
    if not base.is_dir():
        raise WorkspaceError(f"Not a directory: {relative_path or '.'}")

    lines: list[str] = []
    root = workspace.resolve()

    def walk(directory: Path, depth: int) -> None:
        if depth > max_depth:
            return
        try:
            entries = sorted(
                directory.iterdir(),
                key=lambda item: (not item.is_dir(), item.name.lower()),
            )
        except OSError as exc:
            lines.append(f"[cannot read {directory}: {exc}]")
            return
        for entry in entries:
            if entry.name in IMPORT_SKIP_DIR_NAMES:
                continue
            if entry.name.startswith("."):
                continue
            rel = entry.relative_to(root).as_posix()
            if entry.is_dir():
                lines.append(f"{rel}/")
                walk(entry, depth + 1)
            else:
                lines.append(rel)

    walk(base, 1)
    header = f"Project root: {root}"
    if not lines:
        return f"{header}\n(empty)"
    return header + "\n" + "\n".join(lines)


def build_tree(workspace: Path) -> list[dict[str, Any]]:
    if not workspace.exists():
        return []

    def walk(directory: Path) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        from services.project_import_skip import IMPORT_SKIP_DIR_NAMES

        for entry in sorted(
            directory.iterdir(),
            key=lambda item: (not item.is_dir(), item.name.lower()),
        ):
            if entry.name.startswith(".") or entry.name in IMPORT_SKIP_DIR_NAMES:
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
