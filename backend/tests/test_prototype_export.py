import uuid
import zipfile
from io import BytesIO

import pytest

from services.workspace import (
    WorkspaceError,
    build_prototype_handoff_zip,
    ensure_workspace,
    write_file,
)


def test_build_prototype_handoff_zip_includes_html_and_requirements(tmp_path, monkeypatch):
    conversation_id = uuid.uuid4()
    monkeypatch.setenv("WORKSPACES_ROOT", str(tmp_path))
    from config import get_settings

    get_settings.cache_clear()
    workspace = ensure_workspace(conversation_id)
    write_file(workspace, "prototype.html", "<html><body>demo</body></html>")
    write_file(workspace, "REQUIREMENTS.md", "# Todo")

    payload = build_prototype_handoff_zip(workspace)
    with zipfile.ZipFile(BytesIO(payload)) as archive:
        names = set(archive.namelist())
        assert "prototype.html" in names
        assert "REQUIREMENTS.md" in names
        assert "README.txt" in names
        assert "demo" in archive.read("prototype.html").decode()


def test_build_prototype_handoff_zip_requires_prototype(tmp_path, monkeypatch):
    conversation_id = uuid.uuid4()
    monkeypatch.setenv("WORKSPACES_ROOT", str(tmp_path))
    from config import get_settings

    get_settings.cache_clear()
    workspace = ensure_workspace(conversation_id)
    write_file(workspace, "REQUIREMENTS.md", "# only md")

    with pytest.raises(WorkspaceError, match="prototype.html"):
        build_prototype_handoff_zip(workspace)
