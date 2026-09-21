"""Import local project files into a sandbox (ZIP or directory path)."""

from __future__ import annotations

import io
import os
import shutil
import zipfile
from pathlib import Path

from services.project_import_skip import IMPORT_SKIP_DIR_NAMES, SKIP_IMPORT_HINT
from services.workspace import WorkspaceError, safe_resolve

_MAX_ZIP_BYTES = 50 * 1024 * 1024
_MAX_LOCAL_IMPORT_BYTES = 500 * 1024 * 1024
_MAX_ZIP_FILES = 5000
_MAX_LOCAL_IMPORT_FILES = int(os.getenv("MAX_LOCAL_IMPORT_FILES", "50000"))
_SKIP_PREFIXES = ("__MACOSX/",)
_SKIP_DIR_NAMES = IMPORT_SKIP_DIR_NAMES


class ProjectImportError(ValueError):
    """Import failed."""


def _skip_import_rel(rel: str) -> bool:
    if not rel:
        return True
    if any(rel.startswith(prefix) for prefix in _SKIP_PREFIXES):
        return True
    if rel.startswith(".devflow/"):
        return True
    parts = Path(rel).parts
    if ".." in parts:
        return True
    if any(part in _SKIP_DIR_NAMES for part in parts):
        return True
    return False


def _is_text_path(path: str) -> bool:
    lower = path.lower()
    binary_ext = (
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".ico",
        ".woff",
        ".woff2",
        ".zip",
        ".pdf",
        ".exe",
        ".dll",
        ".so",
        ".dylib",
    )
    return not any(lower.endswith(ext) for ext in binary_ext)


def _write_import_file(workspace: Path, rel: str, data: bytes) -> None:
    if len(data) > 5 * 1024 * 1024:
        raise ProjectImportError(f"单文件过大: {rel}")
    try:
        target = safe_resolve(workspace, rel)
    except WorkspaceError as exc:
        raise ProjectImportError(str(exc)) from exc

    target.parent.mkdir(parents=True, exist_ok=True)
    if _is_text_path(rel):
        try:
            target.write_text(data.decode("utf-8"), encoding="utf-8")
        except UnicodeDecodeError:
            target.write_bytes(data)
    else:
        target.write_bytes(data)


def import_zip_to_workspace(workspace: Path, payload: bytes) -> int:
    if len(payload) > _MAX_ZIP_BYTES:
        raise ProjectImportError("ZIP 超过 50MB 限制")
    if not payload:
        raise ProjectImportError("ZIP 文件为空")

    try:
        archive = zipfile.ZipFile(io.BytesIO(payload))
    except zipfile.BadZipFile as exc:
        raise ProjectImportError("不是有效的 ZIP 文件") from exc

    entries = [info for info in archive.infolist() if not info.is_dir()]
    eligible = [
        info
        for info in entries
        if not _skip_import_rel(info.filename.replace("\\", "/").lstrip("/"))
    ]
    if len(eligible) > _MAX_ZIP_FILES:
        raise ProjectImportError(
            f"ZIP 内可导入文件 {len(eligible)} 个，超过 {_MAX_ZIP_FILES} 上限。"
            f"{SKIP_IMPORT_HINT}"
        )

    count = 0
    total_bytes = 0
    for info in entries:
        rel = info.filename.replace("\\", "/").lstrip("/")
        if _skip_import_rel(rel):
            continue
        data = archive.read(info)
        total_bytes += len(data)
        if total_bytes > _MAX_ZIP_BYTES:
            raise ProjectImportError(
                f"ZIP 导入内容超过 50MB。{SKIP_IMPORT_HINT} "
                "桌面端请开启 ALLOW_LOCAL_PATH_IMPORT 使用本机路径导入。"
            )
        _write_import_file(workspace, rel, data)
        count += 1

    if count == 0:
        raise ProjectImportError("ZIP 内没有可导入的文件")
    return count


def import_directory_to_workspace(
    workspace: Path,
    source_dir: Path,
    *,
    max_total_bytes: int = _MAX_LOCAL_IMPORT_BYTES,
) -> int:
    """Copy a local directory tree into the project sandbox (Electron / trusted local API)."""
    root = source_dir.expanduser().resolve()
    if not root.is_dir():
        raise ProjectImportError("目录不存在或不是文件夹")

    workspace_resolved = workspace.resolve()
    try:
        root.relative_to(workspace_resolved)
        raise ProjectImportError("不能从沙箱目录导入")
    except ValueError:
        pass

    files: list[tuple[str, Path]] = []
    for path in root.rglob("*"):
        if path.is_symlink():
            continue
        if path.is_dir():
            continue
        rel = path.relative_to(root).as_posix()
        if _skip_import_rel(rel):
            continue
        files.append((rel, path))

    max_files = _MAX_LOCAL_IMPORT_FILES
    if len(files) > max_files:
        raise ProjectImportError(
            f"可导入文件 {len(files)} 个，超过本机导入上限 {max_files}。"
            f"请确认已跳过 node_modules（当前规则见文档），或缩小所选目录范围。"
            f"{SKIP_IMPORT_HINT}"
        )

    count = 0
    total_bytes = 0
    for rel, path in files:
        data = path.read_bytes()
        total_bytes += len(data)
        if total_bytes > max_total_bytes:
            mb = max_total_bytes // (1024 * 1024)
            raise ProjectImportError(
                f"导入源码超过 {mb}MB（已跳过依赖目录）。{SKIP_IMPORT_HINT}"
            )
        _write_import_file(workspace, rel, data)
        count += 1

    if count == 0:
        raise ProjectImportError(
            f"目录内没有可导入的文件（依赖目录已跳过）。{SKIP_IMPORT_HINT}"
        )
    return count
