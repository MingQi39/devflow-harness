import uuid

from config import Settings, get_settings
from services.dev_project_bootstrap import _copy_delivery_into_docs, materialize_delivery_docs
from services.project_local_bind import bind_local_workspace
from services.workspace import ensure_project_workspace, read_file


def test_materialize_skips_local_docs_when_bound(tmp_path, monkeypatch):
    delivery_id = uuid.uuid4()
    deliveries_root = tmp_path / "deliveries"
    ddir = deliveries_root / str(delivery_id)
    ddir.mkdir(parents=True)
    (ddir / "prototype.html").write_text("<p>proto</p>", encoding="utf-8")
    (ddir / "REQUIREMENTS.md").write_text("# req", encoding="utf-8")

    monkeypatch.setattr(Settings, "deliveries_root", str(deliveries_root))
    monkeypatch.setattr(Settings, "workspaces_root", str(tmp_path / "ws"))
    monkeypatch.setattr(Settings, "allow_local_path_import", True)
    get_settings.cache_clear()

    local = tmp_path / "repo"
    local.mkdir()
    project_id = uuid.uuid4()
    bind_local_workspace(project_id, str(local))
    workspace = ensure_project_workspace(project_id)

    materialize_delivery_docs(project_id, delivery_id, workspace)

    assert not (local / "docs").exists()
    ref = tmp_path / "ws" / "projects" / str(project_id) / "_delivery_ref"
    assert read_file(ref, "docs/prototype.html") == "<p>proto</p>"


def test_materialize_writes_docs_into_server_workspace_when_not_bound(tmp_path, monkeypatch):
    delivery_id = uuid.uuid4()
    deliveries_root = tmp_path / "deliveries"
    ddir = deliveries_root / str(delivery_id)
    ddir.mkdir(parents=True)
    (ddir / "prototype.html").write_text("<p>x</p>", encoding="utf-8")

    monkeypatch.setattr(Settings, "deliveries_root", str(deliveries_root))
    monkeypatch.setattr(Settings, "workspaces_root", str(tmp_path / "ws"))
    get_settings.cache_clear()

    workspace = ensure_project_workspace(uuid.uuid4())
    materialize_delivery_docs(uuid.uuid4(), delivery_id, workspace)
    assert read_file(workspace, "docs/prototype.html") == "<p>x</p>"
