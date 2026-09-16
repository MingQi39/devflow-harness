#!/usr/bin/env bash
# 本地开发：Postgres(Docker) + 后端(uvicorn) + 前端(Vite)
# 用法：./scripts/dev-local.sh          只启动 Postgres
#       ./scripts/dev-local.sh backend   启动 Postgres 并提示后端命令
#       ./scripts/dev-local.sh all       尝试在后台启动后端（需已配置 backend/.env）

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> 启动 PostgreSQL 容器..."
docker compose up postgres -d

echo "==> 等待 Postgres 就绪..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U devflow -d devflow >/dev/null 2>&1; then
    echo "    Postgres OK"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Postgres 启动超时" >&2
    exit 1
  fi
  sleep 1
done

if [ ! -f backend/.env ]; then
  echo ""
  echo "⚠️  未找到 backend/.env，请先："
  echo "    cp backend/.env.example backend/.env"
  echo "    # 填写 OPENAI_API_KEY、JWT_SECRET，确认 DATABASE_URL 指向 localhost"
  exit 1
fi

MODE="${1:-}"

if [ "$MODE" = "all" ]; then
  echo "==> 启动后端 http://127.0.0.1:8000 ..."
  (
    cd backend
    if [ -d venv ]; then
      # shellcheck disable=SC1091
      source venv/bin/activate
    fi
    exec uvicorn main:app --reload --host 127.0.0.1 --port 8000
  ) &
  BACKEND_PID=$!
  echo "    backend PID=$BACKEND_PID"
  sleep 2
  if curl -sf http://127.0.0.1:8000/health >/dev/null; then
    echo "    /health OK"
  else
    echo "    后端未就绪，请在前台运行: cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8000"
  fi
fi

cat <<'EOF'

本地开发已就绪。请开两个终端：

  终端 1 — 后端（在 backend 目录）：
    cd backend
    source venv/bin/activate    # 首次：python3 -m venv venv && pip install -r requirements.txt
    uvicorn main:app --reload --host 127.0.0.1 --port 8000

  终端 2 — 前端：
    cd frontend
    pnpm install                # 首次
    pnpm dev

浏览器：http://localhost:5173
健康检查：http://127.0.0.1:8000/health
API 代理：前端 /api/* → Vite → http://127.0.0.1:8000/*

EOF
