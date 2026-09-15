# DevFlow Harness

多角色 Agent 研发平台 —— 参考 [Pi Agent](https://github.com/earendil-works/pi) 与 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，用 **Python Harness 内核 + React 工作台** 逐步演进，服务 PM / Dev / QA 全链路协作。

> 当前版本：**M1 — Harness 骨架 + SSE 流式对话 + Docker 部署**

**线上 Demo：** http://flow.houmq.cn/

## 当前能力（M1）

- FastAPI 后端：`/chat`、`/chat/stream`（SSE）
- React 前端：流式打字机效果、Markdown 渲染
- 停止生成 / 清空对话
- localStorage 本地持久化
- Docker 双容器部署 + GitHub Actions 自动发布
- 域名：`flow.houmq.cn`（与 my-ai-studio 同服务器，端口 8082）

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.12 · FastAPI · OpenAI SDK |
| 前端 | React 18 · TypeScript · Vite · react-markdown |
| 部署 | Docker · Nginx · GitHub Actions |
| 模型 | OpenAI 兼容 API（DeepSeek / OpenAI 等） |

## 本地开发

### 后端

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env         # 填写 OPENAI_API_KEY / BASE_URL / MODEL
uvicorn main:app --reload --port 8000
```

### 前端

```bash
cd frontend
pnpm install
pnpm dev
```

浏览器访问：http://localhost:5173

## Docker 部署

```bash
cp .env.docker.example .env   # 填写 API Key
chmod +x scripts/docker-deploy.sh
./scripts/docker-deploy.sh
```

本地容器：http://localhost:8082  
生产环境：http://flow.houmq.cn/

详细步骤见 [`deploy/README.md`](deploy/README.md)。

## 自动部署

`main` 分支 push 触发 GitHub Actions（参考 my-ai-studio）：

1. Ubuntu runner 构建镜像
2. Mac self-hosted runner SSH 到服务器 `/home/ubuntu/devflow-harness`
3. `docker compose up -d --no-build`

需在 GitHub 仓库 Settings → Secrets 配置：`DEPLOY_USER`、`DEPLOY_HOST`、`FEISHU_APP_SECRET`（与 my-ai-studio 相同服务器时可复用）。

## 路线图

| 里程碑 | 目标 |
|--------|------|
| **M1** | Harness 骨架 + SSE + Docker 部署 ✅ |
| M2 | 插件协议 + Dev 插件 |
| M3 | Agent Loop + 文件工具 |
| M4 | 平台内预览 |
| M5 | Project Session |
| M6 | PM 插件（需求 → PRD / 原型） |
| M7 | QA 插件（内嵌浏览器） |
| M8 | HTTPS + 生产加固 |

架构说明见 [`docs/architecture.md`](docs/architecture.md)。

## License

MIT
