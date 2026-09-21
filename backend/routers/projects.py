"""Project sandbox routes (import, git workflow)."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from db import get_db
from deps import require_permission
from models.user import User
from config import get_settings
from schemas.dev_project import (
    GitBranchesOut,
    GitDiffOut,
    GitImportSetupRequest,
    GitNewDevBranchRequest,
    GitPushOut,
    GitPushRequest,
    GitStatusOut,
    GitWorkflowOut,
    LocalProjectBindingOut,
    ProjectImportLocalRequest,
    ProjectImportOut,
)
from services.project_access import get_owned_project
from services.project_import_layout import aggregate_parent_without_root_git, resolve_git_cwd
from services.project_git import (
    ProjectGitError,
    diff_against_main,
    ensure_git_repository,
    get_git_status,
    git_repo_ready,
    list_local_branches,
    push_dev_branch,
    setup_import_git_workflow,
    start_requirement_dev_branch,
)
from services.dev_project_bootstrap import materialize_delivery_docs
from services.project_import import (
    ProjectImportError,
    import_zip_to_workspace,
)
from services.project_local_bind import (
    ProjectLocalBindError,
    bind_local_workspace,
    list_owner_local_bindings,
)
from models.project import Project
from services.workspace import ensure_project_workspace

router = APIRouter(prefix="/orgs", tags=["projects"])


@router.get(
    "/{org_id}/projects/local-bindings",
    response_model=list[LocalProjectBindingOut],
)
def get_local_project_bindings(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("dev:write_code"))],
    db: Annotated[Session, Depends(get_db)],
) -> list[LocalProjectBindingOut]:
    rows = list_owner_local_bindings(db, owner_id=user.id, org_id=org_id)
    return [LocalProjectBindingOut.model_validate(row) for row in rows]


def _suggest_main(branches: list[str]) -> str | None:
    for name in ("main", "master"):
        if name in branches:
            return name
    return branches[0] if branches else None


@router.post(
    "/{org_id}/projects/{project_id}/import",
    response_model=ProjectImportOut,
)
async def import_project_zip(
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("dev:write_code"))],
    db: Annotated[Session, Depends(get_db)],
    file: Annotated[UploadFile, File(description="Local project ZIP")],
) -> ProjectImportOut:
    get_owned_project(db, user, org_id, project_id)
    payload = await file.read()
    workspace = ensure_project_workspace(project_id)
    try:
        count = import_zip_to_workspace(workspace, payload)
        git_cwd = resolve_git_cwd(workspace, user.role.value)
        if git_cwd is not None and (
            git_repo_ready(git_cwd) or not aggregate_parent_without_root_git(workspace)
        ):
            ensure_git_repository(git_cwd)
    except ProjectImportError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProjectGitError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return ProjectImportOut(files_imported=count, git_ready=True)


@router.post(
    "/{org_id}/projects/{project_id}/import/local",
    response_model=ProjectImportOut,
)
def import_project_local_directory(
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    body: ProjectImportLocalRequest,
    user: Annotated[User, Depends(require_permission("dev:write_code"))],
    db: Annotated[Session, Depends(get_db)],
) -> ProjectImportOut:
    if not get_settings().allow_local_path_import:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "本机路径导入未启用：在 backend/.env 设置 ALLOW_LOCAL_PATH_IMPORT=true 并重启后端。"
                " 本地/Electron 应走路径拷贝（自动跳过 node_modules、venv 等），不要用 ZIP 传大仓库。"
            ),
        )
    project = get_owned_project(db, user, org_id, project_id)
    try:
        local_root = bind_local_workspace(project_id, body.source_path)
        workspace = ensure_project_workspace(project_id)
        if project.source_delivery_id is not None:
            materialize_delivery_docs(project_id, project.source_delivery_id, workspace)
        git_cwd = resolve_git_cwd(workspace, user.role.value)
        if git_cwd is not None and (
            git_repo_ready(git_cwd) or not aggregate_parent_without_root_git(workspace)
        ):
            ensure_git_repository(git_cwd)
    except (ProjectImportError, ProjectLocalBindError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProjectGitError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return ProjectImportOut(
        files_imported=0,
        git_ready=True,
        local_bound=True,
        local_root=str(local_root),
    )


@router.get(
    "/{org_id}/projects/{project_id}/git/branches",
    response_model=GitBranchesOut,
)
def get_project_git_branches(
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("dev:write_code"))],
    db: Annotated[Session, Depends(get_db)],
) -> GitBranchesOut:
    get_owned_project(db, user, org_id, project_id)
    workspace = ensure_project_workspace(project_id)
    git_cwd = resolve_git_cwd(workspace, user.role.value)
    if git_cwd is None or not git_repo_ready(git_cwd):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="未识别到当前角色对应的前/后端 Git 仓库，请确认子项目目录含 .git",
        )
    init_if_missing = not aggregate_parent_without_root_git(workspace)
    try:
        branches = list_local_branches(git_cwd, init_if_missing=init_if_missing)
    except ProjectGitError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return GitBranchesOut(branches=branches, suggested_main=_suggest_main(branches))


@router.post(
    "/{org_id}/projects/{project_id}/git/setup-import",
    response_model=GitWorkflowOut,
)
def setup_import_git(
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    body: GitImportSetupRequest,
    user: Annotated[User, Depends(require_permission("dev:write_code"))],
    db: Annotated[Session, Depends(get_db)],
) -> GitWorkflowOut:
    get_owned_project(db, user, org_id, project_id)
    workspace = ensure_project_workspace(project_id)
    git_cwd = resolve_git_cwd(workspace, user.role.value)
    if git_cwd is None or not git_repo_ready(git_cwd):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="未找到 Git 仓库：父目录无 .git 时只会在识别出的前/后端子仓库中创建分支",
        )
    try:
        result = setup_import_git_workflow(
            workspace,
            main_branch=body.main_branch.strip(),
            requirement_label=body.requirement_label.strip(),
            git_cwd=git_cwd,
        )
    except ProjectGitError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return GitWorkflowOut(**result)


@router.post(
    "/{org_id}/projects/{project_id}/git/new-dev-branch",
    response_model=GitWorkflowOut,
)
def create_new_dev_branch(
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    body: GitNewDevBranchRequest,
    user: Annotated[User, Depends(require_permission("dev:write_code"))],
    db: Annotated[Session, Depends(get_db)],
) -> GitWorkflowOut:
    get_owned_project(db, user, org_id, project_id)
    workspace = ensure_project_workspace(project_id)
    git_cwd = resolve_git_cwd(workspace, user.role.value)
    if git_cwd is None or not git_repo_ready(git_cwd):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="未找到 Git 仓库：父目录无 .git 时只会在识别出的前/后端子仓库中创建分支",
        )
    try:
        result = start_requirement_dev_branch(
            workspace,
            requirement_label=body.requirement_label.strip(),
            role=user.role.value,
        )
    except ProjectGitError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return GitWorkflowOut(**result)


@router.get(
    "/{org_id}/projects/{project_id}/git/status",
    response_model=GitStatusOut,
)
def get_project_git_status(
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("dev:write_code"))],
    db: Annotated[Session, Depends(get_db)],
) -> GitStatusOut:
    get_owned_project(db, user, org_id, project_id)
    workspace = ensure_project_workspace(project_id)
    try:
        status_payload = get_git_status(workspace, role=user.role.value)
    except ProjectGitError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return GitStatusOut.model_validate(status_payload)


@router.get(
    "/{org_id}/projects/{project_id}/git/diff",
    response_model=GitDiffOut,
)
def get_project_git_diff(
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("dev:write_code"))],
    db: Annotated[Session, Depends(get_db)],
) -> GitDiffOut:
    get_owned_project(db, user, org_id, project_id)
    workspace = ensure_project_workspace(project_id)
    try:
        payload = diff_against_main(workspace, role=user.role.value)
    except ProjectGitError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return GitDiffOut.model_validate(payload)


@router.post(
    "/{org_id}/projects/{project_id}/git/push",
    response_model=GitPushOut,
)
def push_project_git(
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    body: GitPushRequest,
    user: Annotated[User, Depends(require_permission("dev:write_code"))],
    db: Annotated[Session, Depends(get_db)],
) -> GitPushOut:
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请先查看 diff 并确认后再推送",
        )
    get_owned_project(db, user, org_id, project_id)
    workspace = ensure_project_workspace(project_id)
    try:
        message = push_dev_branch(workspace, remote_url=body.remote_url, role=user.role.value)
    except ProjectGitError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return GitPushOut(message=message)
