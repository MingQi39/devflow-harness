import json
import uuid
import zipfile
from io import BytesIO

import pytest

from config import Settings, get_settings
from services.dev_project_bootstrap import DevProjectError, _copy_delivery_into_docs
from services.project_import import import_directory_to_workspace, import_zip_to_workspace
from services.stack_analysis import analyze_stack
from services.stack_templates import apply_stack_templates
from services.workspace import ensure_project_workspace, read_file


def test_materialize_stack_templates(tmp_path, monkeypatch):
    monkeypatch.setattr(Settings, "workspaces_root", str(tmp_path))
    get_settings.cache_clear()
    workspace = ensure_project_workspace(uuid.uuid4())
    stack_id = apply_stack_templates(workspace, "static-html-fastapi")
    assert stack_id == "static-html-fastapi"
    assert read_file(workspace, "frontend/package.json")
    assert read_file(workspace, "backend/main.py")


def test_copy_delivery_into_docs(tmp_path, monkeypatch):
    delivery_id = uuid.uuid4()
    deliveries_root = tmp_path / "deliveries"
    ddir = deliveries_root / str(delivery_id)
    ddir.mkdir(parents=True)
    (ddir / "prototype.html").write_text("<p>hi</p>", encoding="utf-8")
    (ddir / "REQUIREMENTS.md").write_text("# R", encoding="utf-8")
    monkeypatch.setattr(Settings, "deliveries_root", str(deliveries_root))
    monkeypatch.setattr(Settings, "workspaces_root", str(tmp_path / "ws"))
    get_settings.cache_clear()
    workspace = ensure_project_workspace(uuid.uuid4())
    _copy_delivery_into_docs(delivery_id, workspace)
    assert read_file(workspace, "docs/prototype.html") == "<p>hi</p>"


def test_import_zip(tmp_path, monkeypatch):
    monkeypatch.setattr(Settings, "workspaces_root", str(tmp_path))
    get_settings.cache_clear()
    workspace = ensure_project_workspace(uuid.uuid4())
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr("frontend/app.js", "console.log('ok')")
        zf.writestr("backend/main.py", "print('hi')")
    count = import_zip_to_workspace(workspace, buffer.getvalue())
    assert count == 2
    assert read_file(workspace, "frontend/app.js")


def test_import_directory_skips_venv(tmp_path, monkeypatch):
    monkeypatch.setattr(Settings, "workspaces_root", str(tmp_path))
    get_settings.cache_clear()
    source = tmp_path / "source"
    (source / "venv" / "lib").mkdir(parents=True)
    (source / "venv" / "lib" / "x.txt").write_text("skip", encoding="utf-8")
    (source / "src").mkdir(parents=True)
    (source / "src" / "main.py").write_text("ok", encoding="utf-8")
    workspace = ensure_project_workspace(uuid.uuid4())
    count = import_directory_to_workspace(workspace, source)
    assert count == 1
    assert read_file(workspace, "src/main.py") == "ok"


def test_import_directory(tmp_path, monkeypatch):
    monkeypatch.setattr(Settings, "workspaces_root", str(tmp_path))
    get_settings.cache_clear()
    source = tmp_path / "source"
    (source / "frontend").mkdir(parents=True)
    (source / "backend").mkdir(parents=True)
    (source / "frontend" / "app.js").write_text("ok", encoding="utf-8")
    (source / "backend" / "main.py").write_text("hi", encoding="utf-8")
    workspace = ensure_project_workspace(uuid.uuid4())
    count = import_directory_to_workspace(workspace, source)
    assert count == 2
    assert read_file(workspace, "frontend/app.js") == "ok"


def test_analyze_stack_fallback():
    rec, used = analyze_stack(prompt="react dashboard", requirements_hint="")
    assert not used
    assert rec.stack_id == "react-vite-fastapi"


def test_copy_delivery_requires_prototype(tmp_path, monkeypatch):
    delivery_id = uuid.uuid4()
    deliveries_root = tmp_path / "deliveries"
    (deliveries_root / str(delivery_id)).mkdir(parents=True)
    monkeypatch.setattr(Settings, "deliveries_root", str(deliveries_root))
    monkeypatch.setattr(Settings, "workspaces_root", str(tmp_path / "ws"))
    get_settings.cache_clear()
    workspace = ensure_project_workspace(uuid.uuid4())
    with pytest.raises(DevProjectError, match="prototype.html"):
        _copy_delivery_into_docs(delivery_id, workspace)
