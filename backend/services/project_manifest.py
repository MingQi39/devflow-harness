"""Read/update .devflow/project.json in a sandbox."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from services.workspace import WorkspaceError, read_file, write_file

MANIFEST_PATH = ".devflow/project.json"


def read_manifest(workspace: Path) -> dict[str, Any]:
    try:
        raw = read_file(workspace, MANIFEST_PATH)
    except WorkspaceError:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def write_manifest(workspace: Path, data: dict[str, Any]) -> None:
    write_file(workspace, MANIFEST_PATH, json.dumps(data, ensure_ascii=False, indent=2))


def update_manifest_git(workspace: Path, git_patch: dict[str, Any]) -> dict[str, Any]:
    manifest = read_manifest(workspace)
    git_section = manifest.get("git")
    if not isinstance(git_section, dict):
        git_section = {}
    git_section.update(git_patch)
    manifest["git"] = git_section
    write_manifest(workspace, manifest)
    return git_section
