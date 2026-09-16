"""Workspace file tree schemas."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class FileTreeNode(BaseModel):
    name: str
    path: str
    type: Literal["file", "dir"]
    children: Optional[list["FileTreeNode"]] = None


class FileTreeResponse(BaseModel):
    tree: list[FileTreeNode]


class FileContentResponse(BaseModel):
    path: str
    content: str = Field(max_length=512_000)
