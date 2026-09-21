import subprocess
import uuid

from services.project_git import (
    diff_against_main,
    ensure_git_repository,
    list_local_branches,
    setup_import_git_workflow,
)
from services.workspace import ensure_project_workspace, write_file


def test_git_workflow_branch_and_diff(tmp_path, monkeypatch):
    monkeypatch.setenv("WORKSPACES_ROOT", str(tmp_path))
    from config import Settings, get_settings

    monkeypatch.setattr(Settings, "workspaces_root", str(tmp_path))
    get_settings.cache_clear()

    workspace = ensure_project_workspace(uuid.uuid4())
    ensure_git_repository(workspace)
    write_file(workspace, "README.md", "# app\n")
    subprocess.run(["git", "add", "README.md"], cwd=workspace, check=True)
    subprocess.run(
        [
            "git",
            "-c",
            "user.email=t@test.dev",
            "-c",
            "user.name=T",
            "commit",
            "-m",
            "init",
        ],
        cwd=workspace,
        check=True,
    )

    wf = setup_import_git_workflow(
        workspace, main_branch="main", requirement_label="todo-feature"
    )
    assert wf["dev_branch"].startswith("devflow/")
    write_file(workspace, "README.md", "# app\n\nnew req\n")

    diff = diff_against_main(workspace)
    blob = f"{diff.get('summary', '')}\n{diff.get('patch', '')}"
    assert "README.md" in blob or "new req" in blob

    branches = list_local_branches(workspace)
    assert "main" in branches
    assert wf["dev_branch"] in branches
