"""Developer project sandbox schemas."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class StackRecommendation(BaseModel):
    stack_id: str = Field(min_length=1, max_length=64)
    frontend: str = Field(min_length=1, max_length=120)
    backend: str = Field(min_length=1, max_length=120)
    rationale: str = Field(default="", max_length=2000)
    summary: str = Field(default="", max_length=500)


class AnalyzeStackRequest(BaseModel):
    prompt: str = Field(min_length=4, max_length=4000)


class AnalyzeStackResponse(BaseModel):
    recommendation: StackRecommendation
    used_llm: bool = False


DevProjectOriginMode = Literal["import", "greenfield"]


class DevProjectBootstrapCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    mode: DevProjectOriginMode = "greenfield"
    prompt: str | None = Field(default=None, max_length=4000)
    stack: StackRecommendation | None = None
    source_path: str | None = Field(
        default=None,
        max_length=4096,
        description="Electron 本机目录绝对路径；需 ALLOW_LOCAL_PATH_IMPORT=true",
    )

    @model_validator(mode="after")
    def validate_mode_fields(self) -> DevProjectBootstrapCreate:
        if self.mode == "greenfield":
            if not (self.prompt and self.prompt.strip()):
                raise ValueError("greenfield mode requires prompt")
            if self.stack is None:
                raise ValueError("greenfield mode requires stack after analysis")
        return self


class DevProjectBootstrapOut(BaseModel):
    project_id: uuid.UUID
    conversation_id: uuid.UUID
    created: bool
    delivery_id: uuid.UUID
    origin_mode: DevProjectOriginMode
    stack_id: str | None = None
    files_imported: int | None = None


class ProjectImportOut(BaseModel):
    files_imported: int
    git_ready: bool = False
    local_bound: bool = False
    local_root: str | None = None


class ProjectImportLocalRequest(BaseModel):
    source_path: str = Field(min_length=1, max_length=4096)


class LocalProjectBindingOut(BaseModel):
    """Previously bound local directory for this developer (deduped by path)."""

    local_root: str
    label: str
    project_id: uuid.UUID
    updated_at: str


class GitBranchesOut(BaseModel):
    branches: list[str]
    suggested_main: str | None = None


class GitImportSetupRequest(BaseModel):
    main_branch: str = Field(min_length=1, max_length=120)
    requirement_label: str = Field(min_length=1, max_length=200)


class GitNewDevBranchRequest(BaseModel):
    requirement_label: str = Field(min_length=1, max_length=200)


class GitWorkflowOut(BaseModel):
    main_branch: str
    dev_branch: str
    current_branch: str


class GitStatusOut(BaseModel):
    enabled: bool
    main_branch: str | None = None
    dev_branch: str | None = None
    current_branch: str | None = None
    remote_url: str | None = None
    workflow: str | None = None
    repo_root: str | None = None


class GitDiffOut(BaseModel):
    summary: str = ""
    patch: str = ""
    remote_url: str | None = None
    empty: bool = False


class GitPushRequest(BaseModel):
    remote_url: str | None = Field(default=None, max_length=500)
    confirm: bool = False


class GitPushOut(BaseModel):
    message: str
