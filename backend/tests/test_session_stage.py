from pathlib import Path

import pytest

from services.session_stage import (
    SessionStage,
    StageError,
    advance_stage,
    build_system_prompt,
    next_stage,
    preferred_preview_files,
    previous_stage,
    role_can_advance_from,
    role_can_retreat_from,
    stage_advance_ready_message,
    transition_session_stage,
)
from services.workspace import write_file


def test_new_session_starts_at_requirement():
    assert next_stage(SessionStage.requirement) is SessionStage.prototype


def test_advances_only_one_step_forward():
    assert advance_stage(SessionStage.requirement, SessionStage.prototype) is SessionStage.prototype


def test_requirement_advance_blocked_without_dialogue_or_requirements_md(tmp_path: Path):
    workspace = tmp_path / "ws"
    workspace.mkdir()
    assert (
        stage_advance_ready_message(
            SessionStage.requirement,
            workspace=workspace,
            user_message_bodies=[],
        )
        == "请先在对话里描述需求（例如待办要支持增删改）"
    )
    with pytest.raises(StageError, match="REQUIREMENTS"):
        advance_stage(
            SessionStage.requirement,
            SessionStage.prototype,
            role="pm",
            workspace=workspace,
            user_message_bodies=["做一个待办"],
        )
    write_file(workspace, "REQUIREMENTS.md", "# Todo")
    assert (
        advance_stage(
            SessionStage.requirement,
            SessionStage.prototype,
            role="pm",
            workspace=workspace,
            user_message_bodies=["做一个待办"],
        )
        is SessionStage.prototype
    )


def test_prototype_advance_requires_prototype_html(tmp_path: Path):
    workspace = tmp_path / "ws"
    workspace.mkdir()
    write_file(workspace, "REQUIREMENTS.md", "# Todo")
    assert (
        stage_advance_ready_message(
            SessionStage.prototype,
            workspace=workspace,
            user_message_bodies=["请根据 REQUIREMENTS.md 生成可点击的 prototype.html"],
        )
        == "请先生成可点击的 prototype.html 后再移交开发"
    )
    assert advance_stage(SessionStage.prototype, SessionStage.development) is SessionStage.development
    assert advance_stage(SessionStage.development, SessionStage.qa) is SessionStage.qa
    assert advance_stage(SessionStage.qa, SessionStage.done) is SessionStage.done


def test_rejects_skipping_stages():
    with pytest.raises(StageError, match="相邻"):
        advance_stage(SessionStage.requirement, SessionStage.development)


def test_can_retreat_one_step_without_readiness(tmp_path: Path):
    workspace = tmp_path / "ws"
    workspace.mkdir()
    assert previous_stage(SessionStage.prototype) is SessionStage.requirement
    assert (
        transition_session_stage(
            SessionStage.development,
            SessionStage.prototype,
            role="pm",
            workspace=workspace,
            user_message_bodies=[],
        )
        is SessionStage.prototype
    )
    assert role_can_retreat_from("pm", SessionStage.prototype)
    assert not role_can_retreat_from("frontend", SessionStage.prototype)
    assert role_can_retreat_from("pm", SessionStage.development)
    assert not role_can_retreat_from("frontend", SessionStage.development)
    assert not role_can_retreat_from("backend", SessionStage.development)


def test_role_gate_for_stage_advance():
    assert role_can_advance_from("pm", SessionStage.requirement)
    assert role_can_advance_from("pm", SessionStage.prototype)
    assert not role_can_advance_from("pm", SessionStage.development)
    assert role_can_advance_from("frontend", SessionStage.development)
    assert role_can_advance_from("backend", SessionStage.development)
    assert not role_can_advance_from("frontend", SessionStage.prototype)
    assert role_can_advance_from("qa", SessionStage.qa)

    with pytest.raises(StageError, match="开发阶段"):
        advance_stage(
            SessionStage.development,
            SessionStage.qa,
            role="pm",
        )


def test_done_session_cannot_advance():
    assert next_stage(SessionStage.done) is None
    with pytest.raises(StageError, match="already complete"):
        advance_stage(SessionStage.done, SessionStage.done)


def test_preferred_preview_files_follow_the_demo_story():
    assert preferred_preview_files(SessionStage.requirement) == ["REQUIREMENTS.md"]
    assert preferred_preview_files(SessionStage.prototype)[0] == "prototype.html"
    assert preferred_preview_files(SessionStage.development)[0] == "index.html"
    assert preferred_preview_files(SessionStage.qa)[0] == "index.html"


def test_system_prompt_tells_agent_which_file_to_write():
    requirement_prompt = build_system_prompt(SessionStage.requirement)
    prototype_prompt = build_system_prompt(SessionStage.prototype)
    development_prompt = build_system_prompt(SessionStage.development)
    qa_prompt = build_system_prompt(SessionStage.qa)

    assert "REQUIREMENTS.md" in requirement_prompt
    assert "Do not write HTML yet" in requirement_prompt
    assert "prototype.html" in prototype_prompt
    assert "clickable" in prototype_prompt.lower() or "check" in prototype_prompt.lower()
    assert "list_dir" in development_prompt
    assert "docs/" in development_prompt
    assert "Do not change files unless" in qa_prompt
    assert "iframe" in prototype_prompt.lower()
