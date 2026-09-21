from services.agent_tools import execute_tool
from services.project_git import discover_nested_git_repos, format_agent_git_context


def test_format_agent_git_context_no_root_git_lists_nested(tmp_path):
    (tmp_path / "server").mkdir()
    (tmp_path / "server" / ".git").mkdir()
    (tmp_path / "server" / ".git" / "HEAD").write_text("ref: refs/heads/feature-x\n", encoding="utf-8")

    text = format_agent_git_context(tmp_path, "backend")
    assert "NOT a git repository" in text
    assert "Nested repo (server)" in text
    assert "branch =" in text


def test_discover_nested_git_repos_skips_node_modules(tmp_path):
    (tmp_path / "node_modules" / "pkg").mkdir(parents=True)
    (tmp_path / "node_modules" / "pkg" / ".git").mkdir(parents=True)

    assert discover_nested_git_repos(tmp_path) == []


def test_read_file_blocks_dot_git_when_root_not_repo(tmp_path):
    result, changed = execute_tool(tmp_path, "read_file", '{"path":".git/HEAD"}')
    assert changed is False
    assert "NOT a git repository" in result
