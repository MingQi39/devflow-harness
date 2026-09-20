"""Session stage machine for the M3 todo-list closed loop."""

from __future__ import annotations

import enum
from pathlib import Path

from services.workspace import WorkspaceError, read_file


class SessionStage(str, enum.Enum):
    requirement = "requirement"
    prototype = "prototype"
    development = "development"
    qa = "qa"
    done = "done"


class StageError(ValueError):
    """Raised when a stage transition is not allowed."""


STAGE_ORDER: tuple[SessionStage, ...] = (
    SessionStage.requirement,
    SessionStage.prototype,
    SessionStage.development,
    SessionStage.qa,
    SessionStage.done,
)

STAGE_LABELS: dict[SessionStage, str] = {
    SessionStage.requirement: "需求",
    SessionStage.prototype: "原型",
    SessionStage.development: "开发",
    SessionStage.qa: "提测",
    SessionStage.done: "已提测",
}

NEXT_ACTION_LABELS: dict[SessionStage, str] = {
    SessionStage.requirement: "进入原型",
    SessionStage.prototype: "评审通过，移交开发",
    SessionStage.development: "提交测试",
    SessionStage.qa: "测试通过",
}

# Who may advance the session *from* the current stage (M3 轻量角色分工，完整门禁见 M8).
STAGE_ADVANCE_ROLES: dict[SessionStage, tuple[str, ...]] = {
    SessionStage.requirement: ("pm",),
    SessionStage.prototype: ("pm",),
    SessionStage.development: ("frontend", "backend"),
    SessionStage.qa: ("qa",),
}


def role_can_advance_from(role: str, current: SessionStage) -> bool:
    if current is SessionStage.done:
        return False
    allowed = STAGE_ADVANCE_ROLES.get(current, ())
    return role in allowed


def stage_advance_blocked_message(role: str, current: SessionStage) -> str:
    if current is SessionStage.requirement or current is SessionStage.prototype:
        return "当前阶段由 PM 推进（需求整理与原型评审）"
    if current is SessionStage.development:
        return "开发阶段请使用前端或后端账号实现并提交测试"
    if current is SessionStage.qa:
        return "提测阶段请使用 QA 账号验证并通过"
    return "Session 已结束"


def next_stage(current: SessionStage) -> SessionStage | None:
    index = STAGE_ORDER.index(current)
    if index >= len(STAGE_ORDER) - 1:
        return None
    return STAGE_ORDER[index + 1]


def previous_stage(current: SessionStage) -> SessionStage | None:
    index = STAGE_ORDER.index(current)
    if index <= 0:
        return None
    return STAGE_ORDER[index - 1]


# Who may move back *from* the current stage (redo an earlier step).
STAGE_RETREAT_ROLES: dict[SessionStage, tuple[str, ...]] = {
    SessionStage.prototype: ("pm",),
    SessionStage.development: ("pm", "frontend", "backend"),
    SessionStage.qa: ("pm", "qa", "frontend", "backend"),
    SessionStage.done: ("pm", "qa"),
}


def role_can_retreat_from(role: str, current: SessionStage) -> bool:
    if current is SessionStage.requirement:
        return False
    return role in STAGE_RETREAT_ROLES.get(current, ())


def stage_retreat_blocked_message(role: str, current: SessionStage) -> str:
    if current is SessionStage.prototype:
        return "仅 PM 可将 Session 退回到需求阶段"
    if current is SessionStage.development:
        return "请 PM 或开发同学将 Session 退回到原型阶段"
    if current is SessionStage.qa:
        return "请 PM、QA 或开发同学将 Session 退回到开发阶段"
    if current is SessionStage.done:
        return "请 PM 或 QA 将 Session 退回到提测阶段"
    return "已在最早阶段"


# Auto kickoff lines sent as user messages after stage advance (not real requirements).
STAGE_KICKOFF_USER_MESSAGES: frozenset[str] = frozenset(
    {
        "请根据 REQUIREMENTS.md 生成可点击的 prototype.html",
        "请根据 prototype.html 和 REQUIREMENTS.md 实现 index.html",
    }
)


def _workspace_file_nonempty(workspace: Path, relative_path: str) -> bool:
    try:
        return bool(read_file(workspace, relative_path).strip())
    except WorkspaceError:
        return False


def _has_user_requirement_dialogue(user_message_bodies: list[str]) -> bool:
    for body in user_message_bodies:
        text = body.strip()
        if not text or text in STAGE_KICKOFF_USER_MESSAGES:
            continue
        return True
    return False


def stage_advance_ready_message(
    current: SessionStage,
    *,
    workspace: Path,
    user_message_bodies: list[str],
) -> str | None:
    """Return a user-facing reason when the session is not ready to advance."""
    if current is SessionStage.requirement:
        if not _has_user_requirement_dialogue(user_message_bodies):
            return "请先在对话里描述需求（例如待办要支持增删改）"
        if not _workspace_file_nonempty(workspace, "REQUIREMENTS.md"):
            return "请让 Agent 整理并保存 REQUIREMENTS.md 后再进入原型"
        return None
    if current is SessionStage.prototype:
        if not _workspace_file_nonempty(workspace, "REQUIREMENTS.md"):
            return "缺少 REQUIREMENTS.md，请回到需求阶段补充"
        if not _workspace_file_nonempty(workspace, "prototype.html"):
            return "请先生成可点击的 prototype.html 后再移交开发"
        return None
    if current is SessionStage.development:
        if not _workspace_file_nonempty(workspace, "index.html"):
            return "请先实现 index.html 后再提交测试"
        return None
    if current is SessionStage.qa:
        if not _workspace_file_nonempty(workspace, "index.html"):
            return "缺少 index.html，无法完成提测"
        return None
    return None


def transition_session_stage(
    current: SessionStage,
    target: SessionStage,
    *,
    role: str | None = None,
    workspace: Path | None = None,
    user_message_bodies: list[str] | None = None,
) -> SessionStage:
    if target == current:
        if current is SessionStage.done:
            raise StageError("Session is already complete")
        raise StageError("已在当前阶段")
    nxt = next_stage(current)
    prev = previous_stage(current)
    if target == nxt:
        if nxt is None:
            raise StageError("Session is already complete")
        if role is not None and not role_can_advance_from(role, current):
            raise StageError(stage_advance_blocked_message(role, current))
        if workspace is not None and user_message_bodies is not None:
            blocked = stage_advance_ready_message(
                current,
                workspace=workspace,
                user_message_bodies=user_message_bodies,
            )
            if blocked:
                raise StageError(blocked)
        return target
    if target == prev:
        if prev is None:
            raise StageError("已在需求阶段，无法继续后退")
        if role is not None and not role_can_retreat_from(role, current):
            raise StageError(stage_retreat_blocked_message(role, current))
        return target
    if nxt is not None:
        raise StageError(f"只能切换到相邻阶段：{prev.value if prev else '—'} 或 {nxt.value}")
    raise StageError(f"只能切换到 {prev.value if prev else '—'}")


def advance_stage(
    current: SessionStage,
    target: SessionStage,
    *,
    role: str | None = None,
    workspace: Path | None = None,
    user_message_bodies: list[str] | None = None,
) -> SessionStage:
    """Forward-only alias kept for tests and callers that only advance."""
    return transition_session_stage(
        current,
        target,
        role=role,
        workspace=workspace,
        user_message_bodies=user_message_bodies,
    )


def preferred_preview_files(stage: SessionStage) -> list[str]:
    if stage is SessionStage.requirement:
        return ["REQUIREMENTS.md"]
    if stage is SessionStage.prototype:
        return ["prototype.html", "index.html"]
    return ["index.html", "prototype.html"]


def build_system_prompt(stage: SessionStage) -> str:
    label = STAGE_LABELS[stage]
    return (
        "You are DevFlow Harness, an AI assistant embedded in a project session workspace. "
        "Language: match the user's language. Reply in the same language as the user's latest "
        "message (Chinese → Chinese, English → English, etc.). If the latest message mixes "
        "languages, use its dominant language. If still unclear, follow the language of recent "
        "user messages in this session. Do not switch languages unless the user does. "
        "Code, file paths, and technical identifiers may stay in English when appropriate. "
        "You MUST use tools to read and write project files. "
        "When the user asks to create, save, or modify a file, call write_file immediately — "
        "do NOT paste the full file in chat instead of saving it. "
        "When you need existing file contents, call read_file. "
        "Paths are relative to the session root (e.g. index.html, src/app.js). "
        "After write_file succeeds, briefly summarize what you changed in the user's language.\n\n"
        f"Current session stage: {stage.value} ({label}).\n"
        f"{_stage_instructions(stage)}"
    )


def _stage_instructions(stage: SessionStage) -> str:
    if stage is SessionStage.requirement:
        return (
            "Capture the request into REQUIREMENTS.md. For a todo list, specify add, "
            "complete/check, and delete. Do not write HTML yet unless the user insists. "
            "After saving REQUIREMENTS.md, tell the user they can click 「进入原型」."
        )
    if stage is SessionStage.prototype:
        return (
            "Write a self-contained clickable prototype.html. It MUST work inside an iframe: "
            "the user can add todos, check/complete them, and delete them. Use inline CSS/JS, "
            "no external CDN. After writing, tell the user to preview on the left and use "
            "「导出交付包」to send prototype.html + REQUIREMENTS.md to developers. PM reviews "
            "and clicks 「评审通过，移交开发」— do not implement index.html in this stage."
        )
    if stage is SessionStage.development:
        return (
            "Read prototype.html and REQUIREMENTS.md if they exist. Implement the real page as "
            "index.html (plus optional css/js). Do not overwrite prototype.html. The page must "
            "remain interactive in the iframe. After writing, tell the user they can click "
            "「提交测试」."
        )
    if stage is SessionStage.qa:
        return (
            "Do not change files unless the user reports a bug. Help them verify in the iframe: "
            "add an item, check it off, delete an item. After they confirm, they click 「测试通过」."
        )
    return (
        "The demo is complete (已提测). Answer questions; do not rewrite the app unless asked."
    )
