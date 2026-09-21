import uuid

from config import Settings, get_settings
from services.project_local_bind import bind_local_workspace, read_bound_local_root
from services.workspace import ensure_project_workspace, read_file, write_file


def test_bind_local_workspace_uses_disk_path(tmp_path, monkeypatch):
    monkeypatch.setattr(Settings, "workspaces_root", str(tmp_path / "ws"))
    monkeypatch.setattr(Settings, "allow_local_path_import", True)
    get_settings.cache_clear()

    local = tmp_path / "my-repo"
    local.mkdir()
    (local / "README.md").write_text("hello", encoding="utf-8")

    project_id = uuid.uuid4()
    bound = bind_local_workspace(project_id, str(local))
    assert bound == local.resolve()

    workspace = ensure_project_workspace(project_id)
    assert workspace == local.resolve()
    write_file(workspace, "src/app.ts", "export {}")
    assert read_file(local, "src/app.ts") == "export {}"
    assert read_bound_local_root(project_id) == local.resolve()
