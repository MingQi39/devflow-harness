"""Tool definitions and execution for the agent loop."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from services.project_git import format_agent_git_context, git_repo_ready
from services.workspace import WorkspaceError, format_dir_listing, read_file, write_file

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a UTF-8 text file from the current session workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path within the session workspace",
                    }
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_dir",
            "description": (
                "List files and directories under the project root or a subfolder. "
                "Always use this when the user asks about project structure, folders, or "
                "what files exist — do not guess."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": 'Relative directory path; use "" for project root',
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": "How many directory levels to expand (1–4)",
                        "minimum": 1,
                        "maximum": 4,
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Create or overwrite a UTF-8 text file in the current session workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path within the session workspace",
                    },
                    "content": {
                        "type": "string",
                        "description": "Full file content to write",
                    },
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_status",
            "description": (
                "Return live git branch info for the project sandbox (root and nested repos). "
                "MUST call this when the user asks 当前分支 / git 状态 / 什么分支 — "
                "do not answer from chat history or by reading .git/HEAD."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

DEVELOPMENT_TOOL_NAMES = frozenset(
    {"read_file", "list_dir", "write_file", "git_status"},
)


def tools_for_stage(stage_value: str) -> list[dict]:
    """Tool list exposed to the model (git_status only in development)."""
    if stage_value == "development":
        return TOOL_DEFINITIONS
    return [
        tool
        for tool in TOOL_DEFINITIONS
        if tool.get("function", {}).get("name") in DEVELOPMENT_TOOL_NAMES - {"git_status"}
    ]


def _normalize_tool_path(path: str) -> str:
    normalized = path.replace("\\", "/").strip()
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized


def _read_file_git_guard(workspace: Path, path: str) -> str | None:
    normalized = _normalize_tool_path(path)
    if normalized == ".git" or normalized.startswith(".git/"):
        if not git_repo_ready(workspace):
            return (
                "Cannot read .git: project root is NOT a git repository (no .git/ at sandbox root). "
                "Use git_status for current branches on nested repos."
            )
    return None


def execute_tool(
    workspace: Path,
    tool_name: str,
    arguments_json: str,
    *,
    developer_role: str | None = None,
    stage_value: str | None = None,
) -> tuple[str, bool]:
    """Run one tool call. Returns (result_text, file_changed)."""
    try:
        args = json.loads(arguments_json or "{}")
    except json.JSONDecodeError as exc:
        return f"Invalid tool arguments JSON: {exc}", False

    if not isinstance(args, dict):
        return "Tool arguments must be a JSON object", False

    try:
        if tool_name == "read_file":
            path = str(args.get("path", "")).strip()
            guard = _read_file_git_guard(workspace, path)
            if guard is not None:
                return guard, False
            content = read_file(workspace, path)
            return content, False

        if tool_name == "git_status":
            if stage_value != "development":
                return "git_status is only available in the development sandbox stage.", False
            return format_agent_git_context(workspace, developer_role), False

        if tool_name == "list_dir":
            path = str(args.get("path", "")).strip()
            max_depth_raw = args.get("max_depth", 2)
            try:
                max_depth = int(max_depth_raw)
            except (TypeError, ValueError):
                max_depth = 2
            max_depth = max(1, min(4, max_depth))
            listing = format_dir_listing(workspace, path, max_depth=max_depth)
            return listing, False

        if tool_name == "write_file":
            path = str(args.get("path", "")).strip()
            content = str(args.get("content", ""))
            write_file(workspace, path, content)
            return f"Wrote {len(content)} bytes to {path}", True

        return f"Unknown tool: {tool_name}", False
    except WorkspaceError as exc:
        return str(exc), False
    except OSError as exc:
        return f"File operation failed: {exc}", False
