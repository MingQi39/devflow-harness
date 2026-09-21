"""Git workflow inside project sandboxes (branch, diff, push)."""

from __future__ import annotations

import re
import subprocess
import uuid
from pathlib import Path

from services.project_import_layout import (
    ensure_import_layout,
    git_repo_relpath,
    resolve_git_cwd,
)
from services.project_manifest import read_manifest, update_manifest_git

_GIT_TIMEOUT = 90


class ProjectGitError(ValueError):
    """Git operation failed."""


def _run_git(workspace: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=_GIT_TIMEOUT,
        )
    except FileNotFoundError as exc:
        raise ProjectGitError("服务器未安装 git，无法使用分支工作流") from exc
    except subprocess.TimeoutExpired as exc:
        raise ProjectGitError("git 命令超时") from exc
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout or "git failed").strip()
        raise ProjectGitError(detail[:500])
    return result


def git_repo_ready(workspace: Path) -> bool:
    return (workspace / ".git").is_dir()


def ensure_git_repository(workspace: Path) -> None:
    """Init repo on main if import did not include .git."""
    if git_repo_ready(workspace):
        return
    _run_git(workspace, "init", "-b", "main")
    _run_git(workspace, "add", "-A")
    status = _run_git(workspace, "status", "--porcelain", check=False)
    if status.stdout.strip():
        _run_git(
            workspace,
            "-c",
            "user.email=devflow@local",
            "-c",
            "user.name=DevFlow Harness",
            "commit",
            "-m",
            "DevFlow: import snapshot",
        )


def _git_cwd_from_manifest(project_root: Path, role: str | None = None) -> Path | None:
    layout = ensure_import_layout(project_root, use_llm=False)
    manifest = read_manifest(project_root)
    git_section = manifest.get("git") if isinstance(manifest.get("git"), dict) else {}
    repo_root = git_section.get("repo_root")
    if isinstance(repo_root, str) and repo_root.strip() and repo_root.strip() != ".":
        candidate = (project_root / repo_root.strip()).resolve()
        if git_repo_ready(candidate):
            return candidate
    if layout.get("kind") == "split":
        if role == "frontend":
            fe = layout.get("frontend_git")
            if fe is not None and git_repo_ready(fe):
                return fe
        if role == "backend":
            be = layout.get("backend_git")
            if be is not None and git_repo_ready(be):
                return be
    if git_repo_ready(project_root):
        return project_root.resolve()
    resolved = resolve_git_cwd(project_root, role)
    if resolved is not None and git_repo_ready(resolved):
        return resolved
    return None


def _branch_exists(git_cwd: Path, branch: str) -> bool:
    result = _run_git(git_cwd, "rev-parse", "--verify", f"refs/heads/{branch}", check=False)
    return result.returncode == 0


def _checkout_dev_branch(repo_dir: Path, *, main_branch: str, dev_branch: str) -> None:
    if not git_repo_ready(repo_dir):
        raise ProjectGitError(f"目录不是 Git 仓库: {repo_dir}")
    branches = list_local_branches(repo_dir, init_if_missing=False)
    if main_branch not in branches:
        co = _run_git(repo_dir, "checkout", main_branch, check=False)
        if co.returncode != 0:
            raise ProjectGitError(f"找不到主分支「{main_branch}」，当前分支: {', '.join(branches)}")
    _run_git(repo_dir, "checkout", main_branch)
    existing = _run_git(repo_dir, "checkout", "-b", dev_branch, check=False)
    if existing.returncode != 0:
        if not _branch_exists(repo_dir, dev_branch):
            raise ProjectGitError(
                (existing.stderr or existing.stdout or "无法创建开发分支").strip()[:500]
            )
        _run_git(repo_dir, "checkout", dev_branch)


def _current_branch(git_cwd: Path) -> str | None:
    if not git_repo_ready(git_cwd):
        return None
    branch = _run_git(git_cwd, "branch", "--show-current", check=False).stdout.strip()
    return branch or None


def list_local_branches(git_cwd: Path, *, init_if_missing: bool = True) -> list[str]:
    if init_if_missing:
        ensure_git_repository(git_cwd)
    elif not git_repo_ready(git_cwd):
        raise ProjectGitError("当前目录不是 Git 仓库，无法在父目录创建分支")
    result = _run_git(git_cwd, "branch", "--format=%(refname:short)")
    names = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not names:
        result = _run_git(git_cwd, "branch")
        names = [line.strip().lstrip("* ").strip() for line in result.stdout.splitlines() if line.strip()]
    # Prefer main/master first in UI via sort key
    def sort_key(name: str) -> tuple[int, str]:
        if name in {"main", "master"}:
            return (0, name)
        if name.startswith("devflow/"):
            return (2, name)
        return (1, name)

    return sorted(set(names), key=sort_key)


def _sanitize_branch_part(text: str) -> str:
    slug = re.sub(r"[^\w\-]+", "-", text.strip().lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug[:40] or "requirement"


def _dev_branch_name(label: str) -> str:
    suffix = uuid.uuid4().hex[:6]
    return f"devflow/{_sanitize_branch_part(label)}-{suffix}"


def setup_import_git_workflow(
    project_root: Path,
    *,
    main_branch: str,
    requirement_label: str,
    git_cwd: Path | None = None,
) -> dict[str, str]:
    """Record main branch and create a new dev branch for this requirement."""
    layout = ensure_import_layout(project_root, use_llm=False)
    dev_branch = _dev_branch_name(requirement_label)
    fe_git = layout.get("frontend_git")
    be_git = layout.get("backend_git")
    kind = layout.get("kind", "single")

    if kind == "split" and fe_git is not None and be_git is not None and fe_git != be_git:
        _checkout_dev_branch(fe_git, main_branch=main_branch, dev_branch=dev_branch)
        _checkout_dev_branch(be_git, main_branch=main_branch, dev_branch=dev_branch)
        role_repo = git_cwd if git_cwd is not None else fe_git
        git_info = update_manifest_git(
            project_root,
            {
                "main_branch": main_branch,
                "dev_branch": dev_branch,
                "workflow": "import",
                "repo_root": git_repo_relpath(project_root, role_repo.resolve()),
                "layout_kind": "split",
            },
        )
        current = _current_branch(role_repo.resolve()) or dev_branch
        return {
            "main_branch": str(git_info["main_branch"]),
            "dev_branch": str(git_info["dev_branch"]),
            "current_branch": current,
        }

    repo_dir = (git_cwd or layout.get("single_git") or project_root).resolve()
    if not git_repo_ready(repo_dir):
        raise ProjectGitError(
            "未找到 Git 仓库：请在对应的前端/后端子项目目录中初始化或克隆仓库，"
            "父目录无 .git 时不会在父目录创建分支。"
        )
    _checkout_dev_branch(repo_dir, main_branch=main_branch, dev_branch=dev_branch)

    git_info = update_manifest_git(
        project_root,
        {
            "main_branch": main_branch,
            "dev_branch": dev_branch,
            "workflow": "import",
            "repo_root": git_repo_relpath(project_root, repo_dir),
        },
    )
    return {
        "main_branch": str(git_info["main_branch"]),
        "dev_branch": str(git_info["dev_branch"]),
        "current_branch": dev_branch,
    }


def start_requirement_dev_branch(
    project_root: Path,
    *,
    requirement_label: str,
    role: str | None = None,
) -> dict[str, str]:
    """New requirement on existing import project: branch from main again."""
    manifest = read_manifest(project_root)
    git_section = manifest.get("git") if isinstance(manifest.get("git"), dict) else {}
    main_branch = git_section.get("main_branch")
    if not main_branch or not isinstance(main_branch, str):
        raise ProjectGitError("请先配置主分支（导入项目时选择）")
    git_cwd = _git_cwd_from_manifest(project_root, role) or resolve_git_cwd(project_root, role)
    if git_cwd is None:
        raise ProjectGitError("未找到可用的 Git 仓库（父目录无 .git 时请在子项目仓库中操作）")
    return setup_import_git_workflow(
        project_root,
        main_branch=main_branch,
        requirement_label=requirement_label,
        git_cwd=git_cwd,
    )


def _reconcile_dev_branch(
    project_root: Path,
    *,
    current: str | None,
    manifest_dev: object,
    git_cwd: Path | None = None,
) -> str | None:
    """Keep manifest dev_branch aligned with checked-out devflow/* branch."""
    manifest_str = manifest_dev if isinstance(manifest_dev, str) else None
    if current and current.startswith("devflow/"):
        if current != manifest_str:
            update_manifest_git(project_root, {"dev_branch": current})
        return current
    if manifest_str and manifest_str.startswith("devflow/"):
        if git_cwd is not None and git_repo_ready(git_cwd) and _branch_exists(git_cwd, manifest_str):
            if current == manifest_str:
                return manifest_str
        if current is None or current in {"main", "master"} or (
            current and not current.startswith("devflow/")
        ):
            update_manifest_git(project_root, {"dev_branch": None})
    return None


def get_git_status(project_root: Path, *, role: str | None = None) -> dict[str, object]:
    manifest = read_manifest(project_root)
    git_section = manifest.get("git") if isinstance(manifest.get("git"), dict) else {}
    git_cwd = _git_cwd_from_manifest(project_root, role)
    if git_cwd is None or not git_repo_ready(git_cwd):
        return {
            "enabled": False,
            "main_branch": git_section.get("main_branch"),
            "dev_branch": None,
            "current_branch": None,
            "remote_url": None,
            "workflow": git_section.get("workflow"),
            "repo_root": git_section.get("repo_root"),
        }
    current = _current_branch(git_cwd)
    remote = _run_git(git_cwd, "remote", "get-url", "origin", check=False)
    remote_url = remote.stdout.strip() if remote.returncode == 0 else None
    dev_branch = _reconcile_dev_branch(
        project_root,
        current=current,
        manifest_dev=git_section.get("dev_branch"),
        git_cwd=git_cwd,
    )
    return {
        "enabled": True,
        "main_branch": git_section.get("main_branch"),
        "dev_branch": dev_branch,
        "current_branch": current,
        "remote_url": remote_url,
        "workflow": git_section.get("workflow"),
        "repo_root": git_section.get("repo_root"),
    }


_DIFF_PATHSPECS = (".", ":(exclude).devflow")


def _read_origin_url(git_cwd: Path) -> str | None:
    remote = _run_git(git_cwd, "remote", "get-url", "origin", check=False)
    if remote.returncode != 0:
        return None
    url = remote.stdout.strip()
    return url or None


def diff_against_main(project_root: Path, *, role: str | None = None) -> dict[str, object]:
    manifest = read_manifest(project_root)
    git_section = manifest.get("git") if isinstance(manifest.get("git"), dict) else {}
    main_branch = git_section.get("main_branch")
    if not main_branch or not isinstance(main_branch, str):
        raise ProjectGitError("未配置主分支")
    git_cwd = _git_cwd_from_manifest(project_root, role) or resolve_git_cwd(project_root, role)
    if git_cwd is None or not git_repo_ready(git_cwd):
        raise ProjectGitError("Git 仓库不可用")
    remote_url = _read_origin_url(git_cwd)
    _run_git(git_cwd, "add", "-A", check=False)
    stat = _run_git(
        git_cwd,
        "diff",
        "--stat",
        main_branch,
        "--",
        *_DIFF_PATHSPECS,
        check=False,
    )
    patch = _run_git(
        git_cwd,
        "diff",
        main_branch,
        "--",
        *_DIFF_PATHSPECS,
        check=False,
    )
    summary = stat.stdout.strip()
    body = patch.stdout.strip()
    if not summary and not body:
        return {
            "summary": "",
            "patch": "",
            "remote_url": remote_url,
            "empty": True,
        }
    return {
        "summary": summary,
        "patch": body,
        "remote_url": remote_url,
        "empty": False,
    }


def commit_all_if_dirty(workspace: Path, message: str) -> bool:
    _run_git(workspace, "add", "-A", check=False)
    status = _run_git(workspace, "status", "--porcelain", check=False)
    if not status.stdout.strip():
        return False
    _run_git(
        workspace,
        "-c",
        "user.email=devflow@local",
        "-c",
        "user.name=DevFlow Harness",
        "commit",
        "-m",
        message,
    )
    return True


def push_dev_branch(
    project_root: Path,
    *,
    remote_url: str | None = None,
    role: str | None = None,
) -> str:
    manifest = read_manifest(project_root)
    git_section = manifest.get("git") if isinstance(manifest.get("git"), dict) else {}
    git_cwd = _git_cwd_from_manifest(project_root, role) or resolve_git_cwd(project_root, role)
    if git_cwd is None or not git_repo_ready(git_cwd):
        raise ProjectGitError("当前目录不是 Git 仓库，无法 Push")
    current = _current_branch(git_cwd)
    dev_branch = _reconcile_dev_branch(
        project_root,
        current=current,
        manifest_dev=git_section.get("dev_branch"),
        git_cwd=git_cwd,
    )
    if not dev_branch or not isinstance(dev_branch, str):
        raise ProjectGitError("当前不在开发分支工作流中")

    commit_all_if_dirty(git_cwd, f"DevFlow: complete {dev_branch}")

    if remote_url:
        has_origin = _run_git(git_cwd, "remote", "get-url", "origin", check=False)
        if has_origin.returncode != 0:
            _run_git(git_cwd, "remote", "add", "origin", remote_url)
        else:
            _run_git(git_cwd, "remote", "set-url", "origin", remote_url)

    remote_check = _run_git(git_cwd, "remote", "get-url", "origin", check=False)
    if remote_check.returncode != 0:
        raise ProjectGitError("尚未绑定远程 origin，请先填写仓库地址完成绑定后再 Push")

    _run_git(git_cwd, "push", "-u", "origin", dev_branch)
    return f"已推送分支 {dev_branch} 到 origin"


def discover_nested_git_repos(project_root: Path, max_depth: int = 2) -> list[tuple[str, Path]]:
    """Find git repos under project_root (excluding root itself)."""
    from services.project_import_skip import IMPORT_SKIP_DIR_NAMES

    root = project_root.resolve()
    found: list[tuple[str, Path]] = []

    def walk(directory: Path, depth: int, prefix: str) -> None:
        if depth > max_depth:
            return
        try:
            entries = sorted(directory.iterdir(), key=lambda entry: entry.name)
        except OSError:
            return
        for entry in entries:
            if not entry.is_dir():
                continue
            if entry.name.startswith(".") or entry.name in IMPORT_SKIP_DIR_NAMES:
                continue
            rel = f"{prefix}{entry.name}" if prefix else entry.name
            if (entry / ".git").is_dir():
                found.append((rel, entry))
                continue
            walk(entry, depth + 1, f"{rel}/")

    if root.is_dir():
        walk(root, 1, "")
    return found


def format_agent_git_context(project_root: Path, role: str | None = None) -> str:
    """Inject live git facts into the agent system prompt (development stage)."""
    layout = ensure_import_layout(project_root, use_llm=False)
    root = project_root.resolve()
    lines = [
        "=== Live Git status (authoritative this turn) ===",
        "If the user asks 当前分支 / git 状态, answer ONLY from here — not from chat history.",
        "If sandbox root is NOT a git repository, do not claim root has a devflow branch.",
        ".devflow/project.json dev_branch may be stale (e.g. user deleted .git at root).",
        "",
    ]

    def rel(path: Path) -> str:
        try:
            return path.resolve().relative_to(root).as_posix()
        except ValueError:
            return str(path)

    def append_repo(label: str, path: Path | None) -> None:
        if path is None:
            return
        resolved = path.resolve()
        if not git_repo_ready(resolved):
            lines.append(f"- {label} ({rel(resolved)}): NOT a git repository (no .git/)")
            return
        branch = _current_branch(resolved) or "(unknown)"
        lines.append(f"- {label} ({rel(resolved)}): branch = {branch}")

    reported: set[Path] = set()

    def append_repo_tracked(label: str, path: Path | None) -> None:
        if path is None:
            return
        resolved = path.resolve()
        if resolved in reported:
            return
        reported.add(resolved)
        append_repo(label, resolved)

    append_repo_tracked("Sandbox root", root)
    fe_git = layout.get("frontend_git")
    be_git = layout.get("backend_git")
    if fe_git is not None:
        append_repo_tracked("Frontend repo", Path(fe_git))
    if be_git is not None:
        append_repo_tracked("Backend repo", Path(be_git))
    for rel_label, repo_path in discover_nested_git_repos(root):
        append_repo_tracked(f"Nested repo ({rel_label})", repo_path)

    active = _git_cwd_from_manifest(project_root, role) or resolve_git_cwd(project_root, role)
    manifest = read_manifest(project_root)
    git_section = manifest.get("git") if isinstance(manifest.get("git"), dict) else {}
    manifest_dev = git_section.get("dev_branch")
    lines.append("")
    if active is not None and git_repo_ready(active):
        lines.append(
            f"Platform git dir for this developer role: {rel(active)} "
            f"(branch {_current_branch(active)})"
        )
    else:
        lines.append("Platform git dir for this developer role: none")
    if manifest_dev:
        lines.append(
            f"Manifest dev_branch (metadata only — NOT sandbox root branch): {manifest_dev}"
        )
    lines.append(
        "Never claim the sandbox root (.) is on a devflow branch unless Sandbox root line above "
        "shows that branch."
    )
    return "\n".join(lines)
