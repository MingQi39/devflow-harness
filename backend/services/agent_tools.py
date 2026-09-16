"""Tool definitions and execution for the agent loop."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from services.workspace import WorkspaceError, read_file, write_file

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
]


def execute_tool(
    workspace: Path,
    tool_name: str,
    arguments_json: str,
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
            content = read_file(workspace, path)
            return content, False

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
