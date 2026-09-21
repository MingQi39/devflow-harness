import subprocess
import uuid

import pytest

from services.project_import_layout import ensure_import_layout, resolve_git_cwd
from services.project_git import (
    ProjectGitError,
    git_repo_ready,
    list_local_branches,
    setup_import_git_workflow,
)
from services.workspace import write_file


def _init_git(path):
    subprocess.run(["git", "init", "-b", "main"], cwd=path, check=True)
    subprocess.run(
        [
            "git",
            "-c",
            "user.email=t@test.dev",
            "-c",
            "user.name=T",
            "commit",
            "--allow-empty",
            "-m",
            "init",
        ],
        cwd=path,
        check=True,
    )


def test_stale_manifest_layout_redetects_nested_repos(tmp_path):
    parent = tmp_path / "mono-parent"
    fe = parent / "lims-electron"
    be = parent / "lims-server"
    fe.mkdir(parents=True)
    be.mkdir(parents=True)
    (fe / "package.json").write_text("{}", encoding="utf-8")
    (be / "go.mod").write_text("module example.com/lims\n", encoding="utf-8")
    _init_git(fe)
    _init_git(be)
    devflow = parent / ".devflow"
    devflow.mkdir()
    (devflow / "project.json").write_text(
        '{"layout":{"frontend":"frontend","backend":"backend","kind":"single"}}',
        encoding="utf-8",
    )

    layout = ensure_import_layout(parent, use_llm=False)
    assert layout.get("frontend_git") == fe.resolve()
    assert layout.get("backend_git") == be.resolve()
    assert layout.get("kind") == "split"
    assert resolve_git_cwd(parent, "frontend") == fe.resolve()
    assert resolve_git_cwd(parent, "backend") == be.resolve()


def test_split_repos_branch_in_subdir_not_parent(tmp_path):
    parent = tmp_path / "workspace"
    fe = parent / "web-app"
    be = parent / "api-svc"
    fe.mkdir(parents=True)
    be.mkdir(parents=True)
    (fe / "package.json").write_text("{}", encoding="utf-8")
    (be / "requirements.txt").write_text("fastapi\n", encoding="utf-8")
    _init_git(fe)
    _init_git(be)

    fe_git = resolve_git_cwd(parent, "frontend")
    be_git = resolve_git_cwd(parent, "backend")
    assert fe_git == fe.resolve()
    assert be_git == be.resolve()

    wf_fe = setup_import_git_workflow(
        parent,
        main_branch="main",
        requirement_label="req-a",
        git_cwd=fe_git,
    )
    branches_be_after = list_local_branches(be, init_if_missing=False)
    assert wf_fe["dev_branch"] in branches_be_after
    assert not git_repo_ready(parent)
    with pytest.raises(ProjectGitError):
        list_local_branches(parent, init_if_missing=False)
    branches_fe = list_local_branches(fe, init_if_missing=False)
    assert wf_fe["dev_branch"] in branches_fe

    wf_be = setup_import_git_workflow(
        parent,
        main_branch="main",
        requirement_label="req-b",
        git_cwd=be_git,
    )
    branches_be = list_local_branches(be, init_if_missing=False)
    assert wf_be["dev_branch"] in branches_be
    assert wf_fe["dev_branch"] != wf_be["dev_branch"]


def test_single_repo_one_branch(tmp_path, monkeypatch):
    monkeypatch.setenv("WORKSPACES_ROOT", str(tmp_path))
    from config import Settings, get_settings

    monkeypatch.setattr(Settings, "workspaces_root", str(tmp_path))
    get_settings.cache_clear()

    root = tmp_path / "projects" / str(uuid.uuid4())
    root.mkdir(parents=True)
    (root / "frontend").mkdir()
    (root / "backend").mkdir()
    _init_git(root)
    write_file(root, "README.md", "# mono\n")

    fe_git = resolve_git_cwd(root, "frontend")
    be_git = resolve_git_cwd(root, "backend")
    assert fe_git == be_git == root.resolve()

    wf = setup_import_git_workflow(
        root,
        main_branch="main",
        requirement_label="mono-req",
        git_cwd=fe_git,
    )
    branches = list_local_branches(root, init_if_missing=False)
    assert wf["dev_branch"] in branches
