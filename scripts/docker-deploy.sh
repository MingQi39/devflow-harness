#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  if [ -f .env.docker.example ]; then
    cp .env.docker.example .env
    echo "Created .env from .env.docker.example — please edit OPENAI_API_KEY before production use."
  else
    echo "Missing .env — copy .env.docker.example to .env first." >&2
    exit 1
  fi
fi

docker compose up -d --build
docker compose ps

echo ""
echo "DevFlow Harness is running:"
echo "  Local:    http://localhost:8082"
echo "  Production (after nginx): http://flow.houmq.cn/"
