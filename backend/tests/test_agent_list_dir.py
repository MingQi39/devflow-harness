import uuid

from config import Settings, get_settings
from services.agent_tools import execute_tool
from services.project_local_bind import bind_local_workspace
from services.workspace import ensure_project_workspace, format_dir_listing


def test_format_dir_listing_skips_node_modules(tmp_path, monkeypatch):
    monkeypatch.setattr(Settings, "workspaces_root", str(tmp_path / "ws"))
    monkeypatch.setattr(Settings, "allow_local_path_import", True)
    get_settings.cache_clear()

    local = tmp_path / "repo"
    (local / "src").mkdir(parents=True)
    (local / "src" / "main.py").write_text("x", encoding="utf-8")
    (local / "node_modules" / "pkg").mkdir(parents=True)
    (local / "node_modules" / "pkg" / "index.js").write_text("y", encoding="utf-8")

    project_id = uuid.uuid4()
    bind_local_workspace(project_id, str(local))
    workspace = ensure_project_workspace(project_id)

    text = format_dir_listing(workspace, max_depth=2)
    assert "src/" in text
    assert "src/main.py" in text
    assert "node_modules" not in text


def test_list_dir_tool_uses_bound_root(tmp_path, monkeypatch):
    monkeypatch.setattr(Settings, "workspaces_root", str(tmp_path / "ws"))
    monkeypatch.setattr(Settings, "allow_local_path_import", True)
    get_settings.cache_clear()

    local = tmp_path / "lims"
    local.mkdir()
    (local / "apps" / "web").mkdir(parents=True)
    (local / "apps" / "web" / "package.json").write_text("{}", encoding="utf-8")

    project_id = uuid.uuid4()
    bind_local_workspace(project_id, str(local))
    workspace = ensure_project_workspace(project_id)

    result, changed = execute_tool(workspace, "list_dir", '{"path":"","max_depth":3}')
    assert not changed
    assert "apps/" in result
    assert "apps/web/package.json" in result
