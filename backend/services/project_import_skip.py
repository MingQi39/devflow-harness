"""Directory names skipped when importing local projects (deps / caches / VCS)."""

from __future__ import annotations

# Keep in sync with desktop/lib/zipProjectDirectory.mjs SKIP_DIR_NAMES
IMPORT_SKIP_DIR_NAMES: frozenset[str] = frozenset(
    {
        "node_modules",
        "__MACOSX",
        ".devflow",
        ".git",
        "venv",
        ".venv",
        "dist",
        "build",
        ".next",
        "target",
        "__pycache__",
        ".turbo",
        "coverage",
        ".cache",
        ".pytest_cache",
        ".mypy_cache",
        ".pnpm-store",
        "vendor",
        "Pods",
        ".gradle",
        "workspaces",
        ".cursor",
        ".idea",
        "site-packages",
    }
)

SKIP_IMPORT_HINT = (
    "导入时会自动跳过 node_modules、venv、.git、.pnpm-store 等依赖与缓存目录，"
    "请在沙箱内用 package-lock / pnpm-lock / requirements.txt 重新安装依赖。"
)
