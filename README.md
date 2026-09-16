# DevFlow Harness

PM / 前后端 / QA 共用的研发工作台。参考 [Pi Agent](https://github.com/earendil-works/pi) 的 Session + Tools，以及 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件化扩展；内核是 Python Harness，界面是 React 工作台。一条需求从发起到提测都在平台内完成，不是 IDE 插件。

> 当前版本：**M2 — Session 工作区 + Agent Loop + 读/写文件**

**线上 Demo：** http://flow.houmq.cn/

## 当前能力

- **账号体系**：注册 / 登录 / 登出，JWT（7 天），注册时选择角色（PM / 前端 / 后端 / QA）
- **Session 工作区**：一个需求 = 一个 Session，独立项目目录 + 文件树
- **Agent Loop**：模型多轮调用 `read_file` / `write_file`，SSE 穿插 tool call / result 事件
- **多 Session**：侧边栏管理，消息与工作区持久化 PostgreSQL + 磁盘，刷新不丢
- **聊天分享**：生成只读分享链接，未登录可查看
- **RBAC**：四角色权限 seed，路由级 `require_permission()`
- **SSE 流式**：FastAPI `/chat/stream`，React 打字机 + Markdown + 工具卡片
- **停止生成**（中断 Agent Loop）/ 新建 / 重命名 / 删除 Session
- **Docker 三容器**（postgres + backend + frontend）+ GitHub Actions 自动发布
- 域名：`flow.houmq.cn`（容器映射端口 8082）

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.10+（推荐 3.12）· FastAPI · SQLAlchemy 2.0 · Alembic · OpenAI SDK |
| 数据库 | PostgreSQL 16 |
| 鉴权 | JWT（python-jose）· bcrypt（passlib） |
| 前端 | React 18 · TypeScript · Vite · react-router-dom · react-markdown |
| 部署 | Docker · Nginx · GitHub Actions |
| 模型 | OpenAI 兼容 API（DeepSeek / OpenAI 等） |

## 本地开发（推荐）

M1.5 起**必须有 PostgreSQL**。本地最省事的方式：**Docker 只跑数据库，前后端裸跑**。

### 架构

```
浏览器 http://localhost:5173
    │
    ▼  Vite dev server
    │  /api/*  ──proxy──►  http://127.0.0.1:8000/*
    ▼
FastAPI (backend/.env → DATABASE_URL=...@localhost:5432)
    │
    ▼
PostgreSQL (docker compose up postgres -d)
```

### 前置条件

- Docker（跑 Postgres）
- Python **3.10+**（`python3 --version`，3.9 无法启动当前后端）
- pnpm（或 npm）

### 第一次配置

```bash
# 1. 启动数据库
docker compose up postgres -d

# 2. 后端环境
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# 编辑 .env：OPENAI_API_KEY、JWT_SECRET 必填
# DATABASE_URL 必须是 localhost（不是 postgres）：
#   DATABASE_URL=postgresql://devflow:qwer.123@localhost:5432/devflow

# 3. 前端依赖
cd ../frontend
pnpm install
```

或使用辅助脚本（会启动 Postgres 并打印命令）：

```bash
chmod +x scripts/dev-local.sh
./scripts/dev-local.sh
```

### 日常启动（两个终端）

**终端 1 — 后端**

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

确认：`curl http://127.0.0.1:8000/health` 应返回 `{"status":"ok",...}`

**终端 2 — 前端**

```bash
cd frontend
pnpm dev
```

浏览器打开：**http://localhost:5173**

### 环境变量说明

| 文件 | 用途 |
|------|------|
| `backend/.env` | **本地裸跑** uvicorn 时读取（`load_dotenv` 读当前目录） |
| 根目录 `.env` | **docker compose** 三容器部署时读取 |

两者 `DATABASE_URL` 主机名不同：

| 场景 | DATABASE_URL 主机 |
|------|-------------------|
| 本地裸跑 | `localhost` |
| Docker 全栈 | `postgres` |

`frontend/` **不需要** `.env`；API 走 Vite 代理 `/api`。

### 常见问题

| 现象 | 原因 / 处理 |
|------|-------------|
| 前端报接口失败 / 502 | 后端未启动或崩溃；看终端 1 是否有报错 |
| `MappedAnnotationError` / `str \| None` | Python 版本过低，需 **3.10+** |
| 数据库连接失败 | 先 `docker compose up postgres -d`；`.env` 用 `localhost` |
| 迁移失败 | 确保 Postgres 健康：`docker compose ps` |
| 登录 401 | 先注册；或检查 `JWT_SECRET` 是否变更导致旧 token 失效 |

## 方式二：全 Docker 本地

不裸跑前后端，三容器一键起：

```bash
cp .env.docker.example .env   # 填写 API Key、POSTGRES_PASSWORD、JWT_SECRET
chmod +x scripts/docker-deploy.sh
./scripts/docker-deploy.sh
# → http://localhost:8082
```

## Docker 部署（生产）

三容器：`postgres` + `backend` + `frontend`。启动时 backend 自动执行 Alembic 迁移并 seed 权限。

```bash
cp .env.docker.example .env
chmod +x scripts/docker-deploy.sh
./scripts/docker-deploy.sh
```

本地容器：http://localhost:8082  
生产环境：http://flow.houmq.cn/

详细步骤见 [`deploy/README.md`](deploy/README.md)。

## 自动部署

`main` 分支 push 触发 GitHub Actions：

1. Ubuntu runner 构建镜像
2. Mac self-hosted runner SSH 到服务器 `/home/ubuntu/devflow-harness`
3. `docker compose up -d --no-build`

需在 GitHub 仓库 Settings → Secrets 配置：`DEPLOY_USER`、`DEPLOY_HOST`、`FEISHU_APP_SECRET`（可选，飞书部署通知）。

服务器 `.env` 需包含：`OPENAI_API_KEY`、`POSTGRES_PASSWORD`、`JWT_SECRET`、`APP_PUBLIC_URL`。

## 路线图

终局：产品发需求 → 生成原型并评审 → 平台内生成/预览/调试前后端 → 提测 → 内嵌浏览器测试 → 平台内看数据库。M3 先用「待办列表」跑通全角色；之后把每个角色做到能真正干活。插件协议放在工具都跑真之后（M9），避免空框架。

| 里程碑 | 目标 |
|--------|------|
| **M1** | 对话通道：Harness 骨架 + SSE + Docker ✅ |
| **M1.5** | 用户体系 + 多对话 + 分享 + PostgreSQL ✅ |
| **M2** | Session 工作区 + Agent Loop + 读/写文件 ✅ |
| M3 | 全角色最小闭环（待办 Demo：需求 → 原型 → 预览 → iframe 点测） |
| M4 | Dev 工作台完善：真实预览运行时 + 调试 |
| M5 | 后端运行时 + 平台内数据库浏览/查询 |
| M6 | PM 完善：PRD、多页原型、评审批注与门禁 |
| M7 | QA 完善：内嵌浏览器、截图、缺陷回流 Session |
| M8 | 角色协作：同一 Session 多人 + 状态机（登录/RBAC 已在 M1.5） |
| M9 | Plugin Registry：现有工具收成可扩展协议 |
| M10 | 生产级：HTTPS、审计、多项目隔离 |

详细验收与刻意延后项见 [`docs/roadmap.md`](docs/roadmap.md)。架构见 [`docs/architecture.md`](docs/architecture.md)。

## License

MIT
