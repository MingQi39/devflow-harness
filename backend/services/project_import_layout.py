"""Detect import project layout and resolve Git repo roots (parent vs sub-repos)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Literal

from fastapi import HTTPException
from openai import OpenAI

from services.project_import_skip import IMPORT_SKIP_DIR_NAMES
from services.project_manifest import read_manifest, write_manifest
from services.llm import get_llm_client, get_model
from services.workspace import format_dir_listing

LayoutKind = Literal["single", "split"]


def _git_ready(path: Path) -> bool:
    return (path / ".git").is_dir()


def _norm_rel(path: str) -> str:
    clean = path.strip().replace("\\", "/").strip("/")
    return clean or "."


def nearest_git_root(start: Path, stop: Path) -> Path | None:
    """Walk from ``start`` up to ``stop`` (inclusive); first directory with ``.git``."""
    current = start.resolve()
    boundary = stop.resolve()
    while True:
        if _git_ready(current):
            return current
        if current == boundary:
            break
        parent = current.parent
        if parent == current:
            break
        current = parent
    return None


def _child_project_dirs(project_root: Path) -> list[Path]:
    out: list[Path] = []
    try:
        entries = sorted(project_root.iterdir(), key=lambda p: p.name.lower())
    except OSError:
        return out
    for entry in entries:
        if not entry.is_dir():
            continue
        if entry.name in IMPORT_SKIP_DIR_NAMES or entry.name.startswith("."):
            continue
        out.append(entry)
    return out


def _looks_frontend(dir_path: Path) -> bool:
    if (dir_path / "package.json").is_file():
        return True
    for name in ("vite.config.ts", "vite.config.js", "next.config.js", "next.config.mjs"):
        if (dir_path / name).is_file():
            return True
    return False


def _looks_backend(dir_path: Path) -> bool:
    markers = (
        "pyproject.toml",
        "requirements.txt",
        "main.py",
        "app.py",
        "go.mod",
        "pom.xml",
        "build.gradle",
    )
    return any((dir_path / name).is_file() for name in markers)


def _frontend_layout_score(dir_path: Path) -> tuple[int, str]:
    score = 0
    if (dir_path / "package.json").is_file():
        score += 5
    name = dir_path.name.lower()
    for token in ("electron", "frontend", "web", "client", "ui", "app"):
        if token in name:
            score += 3
    return (-score, name)


def _backend_layout_score(dir_path: Path) -> tuple[int, str]:
    score = 0
    if (dir_path / "go.mod").is_file():
        score += 10
    if (dir_path / "pyproject.toml").is_file():
        score += 9
    if (dir_path / "pom.xml").is_file() or (dir_path / "build.gradle").is_file():
        score += 8
    if (dir_path / "main.py").is_file() or (dir_path / "app.py").is_file():
        score += 4
    if (dir_path / "requirements.txt").is_file():
        score += 2
    name = dir_path.name.lower()
    for token in ("server", "backend", "api", "svc", "service"):
        if token in name:
            score += 5
    return (-score, name)


def _heuristic_layout(project_root: Path) -> tuple[str, str, LayoutKind]:
    root = project_root.resolve()
    if _git_ready(root):
        fe = "frontend" if (root / "frontend").is_dir() else "."
        be = "backend" if (root / "backend").is_dir() else "."
        if fe == "." and be == ".":
            return ".", ".", "single"
        return _norm_rel(fe), _norm_rel(be), "single"

    children = _child_project_dirs(root)
    fe_candidates = sorted(
        [c for c in children if _looks_frontend(c)],
        key=_frontend_layout_score,
    )
    be_candidates = sorted(
        [c for c in children if _looks_backend(c)],
        key=_backend_layout_score,
    )

    fe_path = fe_candidates[0].name if fe_candidates else (
        "frontend" if (root / "frontend").is_dir() else "."
    )
    be_path = be_candidates[0].name if be_candidates else (
        "backend" if (root / "backend").is_dir() else "."
    )

    fe_git = nearest_git_root(root / fe_path, root) if fe_path != "." else None
    be_git = nearest_git_root(root / be_path, root) if be_path != "." else None

    if fe_git and be_git and fe_git != be_git:
        return _norm_rel(fe_path), _norm_rel(be_path), "split"
    if fe_git or be_git:
        return _norm_rel(fe_path), _norm_rel(be_path), "single"

    named_fe = (root / "frontend").is_dir()
    named_be = (root / "backend").is_dir()
    if named_fe or named_be:
        return (
            "frontend" if named_fe else ".",
            "backend" if named_be else ".",
            "single",
        )
    return ".", ".", "single"


def _parse_layout_llm(raw: str) -> dict[str, str] | None:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    fe = str(data.get("frontend", "")).strip()
    be = str(data.get("backend", "")).strip()
    kind = str(data.get("kind", "single")).strip().lower()
    if kind not in {"single", "split"}:
        kind = "single"
    if not fe:
        fe = "."
    if not be:
        be = "."
    return {"frontend": _norm_rel(fe), "backend": _norm_rel(be), "kind": kind}


def _llm_layout(project_root: Path) -> dict[str, str] | None:
    try:
        client: OpenAI = get_llm_client()
        model = get_model()
    except HTTPException:
        return None

    listing = format_dir_listing(project_root, "", max_depth=2)
    system = (
        "You analyze a local project folder tree. Reply JSON only, no markdown. "
        "Fields: frontend (relative path to frontend app root), "
        "backend (relative path to backend app root), "
        "kind (single = one git repo for full stack, split = separate repos). "
        "Use \".\" when the app lives at the import root. "
        "For a parent folder containing multiple git projects, point frontend/backend "
        "to the correct subfolders — never invent paths not visible in the listing."
    )
    user = f"Import root listing:\n{listing[:12000]}"
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.1,
        )
        content = completion.choices[0].message.content or ""
        return _parse_layout_llm(content)
    except Exception:
        return None


def _layout_section(manifest: dict[str, Any]) -> dict[str, Any]:
    layout = manifest.get("layout")
    return layout if isinstance(layout, dict) else {}


def _layout_is_stale(project_root: Path, layout: dict[str, Any]) -> bool:
    """Manifest layout from template import may point at missing frontend/backend folders."""
    root = project_root.resolve()
    fe_rel = _norm_rel(str(layout.get("frontend") or "frontend"))
    be_rel = _norm_rel(str(layout.get("backend") or "backend"))
    fe_dir = root if fe_rel == "." else (root / fe_rel)
    be_dir = root if be_rel == "." else (root / be_rel)

    roots = _git_roots_for_layout(project_root, layout)
    has_git = bool(
        roots.get("root_git")
        or roots.get("frontend_git")
        or roots.get("backend_git")
        or roots.get("single_git")
    )
    if has_git:
        h_fe, h_be, h_kind = _heuristic_layout(project_root)
        if h_fe != fe_rel or h_be != be_rel:
            heuristic_roots = _git_roots_for_layout(
                project_root,
                {"frontend": h_fe, "backend": h_be, "kind": h_kind},
            )
            if heuristic_roots.get("frontend_git") != roots.get("frontend_git"):
                return True
            if heuristic_roots.get("backend_git") != roots.get("backend_git"):
                return True
        return False

    if fe_rel != "." and not fe_dir.is_dir():
        return True
    if be_rel != "." and not be_dir.is_dir():
        return True

    h_fe, h_be, h_kind = _heuristic_layout(project_root)
    heuristic_roots = _git_roots_for_layout(
        project_root,
        {"frontend": h_fe, "backend": h_be, "kind": h_kind},
    )
    return bool(
        heuristic_roots.get("root_git")
        or heuristic_roots.get("frontend_git")
        or heuristic_roots.get("backend_git")
        or heuristic_roots.get("single_git")
    )


def _git_roots_for_layout(project_root: Path, layout: dict[str, Any]) -> dict[str, Any]:
    root = project_root.resolve()
    fe_rel = _norm_rel(str(layout.get("frontend") or "frontend"))
    be_rel = _norm_rel(str(layout.get("backend") or "backend"))
    kind = str(layout.get("kind") or "single")
    if kind not in {"single", "split"}:
        kind = "single"

    fe_dir = root if fe_rel == "." else (root / fe_rel)
    be_dir = root if be_rel == "." else (root / be_rel)

    root_git = nearest_git_root(root, root)
    fe_git = nearest_git_root(fe_dir, root) if fe_dir.is_dir() else None
    be_git = nearest_git_root(be_dir, root) if be_dir.is_dir() else None
    single: Path | None = None

    if fe_git and be_git and fe_git != be_git:
        kind = "split"
    elif root_git:
        kind = "single"
        single = root_git
    elif fe_git and be_git:
        single = fe_git if fe_git == be_git else None
        kind = "split" if single is None else "single"
    elif fe_git or be_git:
        single = fe_git or be_git
        kind = "single"
    else:
        single = None

    return {
        "frontend": fe_rel,
        "backend": be_rel,
        "kind": kind,
        "frontend_git": fe_git,
        "backend_git": be_git,
        "root_git": root_git,
        "single_git": single,
    }


def ensure_import_layout(project_root: Path, *, use_llm: bool = True) -> dict[str, Any]:
    """Detect frontend/backend paths; persist under manifest.layout when missing."""
    manifest = read_manifest(project_root)
    layout = _layout_section(manifest)
    fe = layout.get("frontend")
    be = layout.get("backend")
    if isinstance(fe, str) and isinstance(be, str) and fe.strip() and be.strip():
        if _layout_is_stale(project_root, layout):
            fe = be = None  # force re-detect below
        else:
            resolved = _git_roots_for_layout(project_root, layout)
            resolved["detected_by"] = layout.get("detected_by") or "manifest"
            return resolved

    parsed = _llm_layout(project_root) if use_llm else None
    detected_by = "llm" if parsed else "heuristic"
    if parsed:
        fe_rel, be_rel, kind = parsed["frontend"], parsed["backend"], parsed["kind"]
    else:
        fe_rel, be_rel, kind = _heuristic_layout(project_root)

    layout_payload = {
        "frontend": fe_rel,
        "backend": be_rel,
        "kind": kind,
        "detected_by": detected_by,
    }
    layout_section = _layout_section(manifest)
    layout_section.update(layout_payload)
    manifest["layout"] = layout_section
    write_manifest(project_root, manifest)

    resolved = _git_roots_for_layout(project_root, layout_payload)
    resolved["detected_by"] = detected_by
    return resolved


def _role_subpath(layout: dict[str, Any], role: str | None) -> str:
    if role == "frontend":
        return _norm_rel(str(layout.get("frontend") or "frontend"))
    if role == "backend":
        return _norm_rel(str(layout.get("backend") or "backend"))
    fe = _norm_rel(str(layout.get("frontend") or "frontend"))
    be = _norm_rel(str(layout.get("backend") or "backend"))
    return fe if fe != "." else be


def resolve_git_cwd(project_root: Path, role: str | None) -> Path | None:
    """
    Git directory for the current developer role.
    Never falls back to parent import root when it has no ``.git`` but child repos do.
    """
    layout = ensure_import_layout(project_root)
    root = project_root.resolve()
    kind = layout.get("kind", "single")

    if kind == "split":
        if role == "frontend":
            return layout.get("frontend_git")
        if role == "backend":
            return layout.get("backend_git")
        return layout.get("frontend_git") or layout.get("backend_git")

    single = layout.get("single_git") or layout.get("root_git")
    if single is not None:
        return single

    role_rel = _role_subpath(layout, role)
    role_dir = root if role_rel == "." else (root / role_rel)
    if not role_dir.is_dir() and role_rel != ".":
        role_dir = root

    if _git_ready(root):
        return root

    if layout.get("root_git") is None and (
        layout.get("frontend_git") or layout.get("backend_git")
    ):
        # Aggregate parent: only sub-repos, no init at parent
        if role == "frontend":
            candidate = layout.get("frontend_git")
        elif role == "backend":
            candidate = layout.get("backend_git")
        else:
            candidate = layout.get("frontend_git") or layout.get("backend_git")
        if candidate is not None and _git_ready(candidate):
            return candidate
        return None

    if _git_ready(role_dir):
        return role_dir
    return None


def git_repo_relpath(project_root: Path, git_cwd: Path) -> str:
    rel = git_cwd.resolve().relative_to(project_root.resolve())
    return "." if rel.parts == () else rel.as_posix()


def aggregate_parent_without_root_git(project_root: Path) -> bool:
    layout = ensure_import_layout(project_root, use_llm=False)
    return layout.get("root_git") is None and bool(
        layout.get("frontend_git") or layout.get("backend_git")
    )
