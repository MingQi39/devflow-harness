"""Apply stack-specific frontend/backend templates into a project sandbox."""

from __future__ import annotations

import shutil
from pathlib import Path

from services.workspace import write_file

_STACKS_ROOT = Path(__file__).resolve().parent.parent / "dev_templates" / "stacks"
_LEGACY_ROOT = Path(__file__).resolve().parent.parent / "dev_templates"
_DEFAULT_STACK = "static-html-fastapi"


def apply_stack_templates(workspace: Path, stack_id: str) -> str:
    """Copy stack templates; return effective stack_id."""
    effective = stack_id if (_STACKS_ROOT / stack_id).is_dir() else _DEFAULT_STACK
    source = _STACKS_ROOT / effective
    if not source.is_dir():
        for folder in ("frontend", "backend"):
            legacy = _LEGACY_ROOT / folder
            if legacy.is_dir():
                target = workspace / folder
                if target.exists():
                    shutil.rmtree(target)
                shutil.copytree(legacy, target)
        return _DEFAULT_STACK

    for folder in ("frontend", "backend"):
        part = source / folder
        if not part.is_dir():
            continue
        target = workspace / folder
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(part, target)

    note = source / "STACK.md"
    if note.is_file():
        write_file(workspace, "STACK.md", note.read_text(encoding="utf-8"))
    return effective
