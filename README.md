# DevFlow Harness

PM / 前后端 / QA 共用的研发工作台。参考 [Pi Agent](https://github.com/earendil-works/pi) 的 Session + Tools，以及 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件化扩展；内核是 Python Harness，界面是 React 工作台。一条需求从发起到提测都在平台内完成，不是 IDE 插件。

> 当前版本：**M1 — Harness 骨架 + SSE 流式对话 + Docker 部署**

**线上 Demo：** http://flow.houmq.cn/

## 当前能力（M1）

- FastAPI 后端：`/chat`、`/chat/stream`（SSE）
- React 前端：流式打字机效果、Markdown 渲染
- 停止生成 / 清空对话
- localStorage 本地持久化
- Docker 双容器部署 + GitHub Actions 自动发布
- 域名：`flow.houmq.cn`（容器映射端口 8082）

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

`main` 分支 push 触发 GitHub Actions：

1. Ubuntu runner 构建镜像
2. Mac self-hosted runner SSH 到服务器 `/home/ubuntu/devflow-harness`
3. `docker compose up -d --no-build`

需在 GitHub 仓库 Settings → Secrets 配置：`DEPLOY_USER`、`DEPLOY_HOST`、`FEISHU_APP_SECRET`（可选，飞书部署通知）。

## 路线图

终局：产品发需求 → 生成原型并评审 → 平台内生成/预览/调试前后端 → 提测 → 内嵌浏览器测试 → 平台内看数据库。M3 先用「待办列表」跑通全角色；之后把每个角色做到能真正干活。插件协议放在工具都跑真之后（M9），避免空框架。

| 里程碑 | 目标 |
|--------|------|
| **M1** | 对话通道：Harness 骨架 + SSE + Docker ✅ |
| M2 | Session 工作区 + Agent Loop + 读/写文件 |
| M3 | 全角色最小闭环（待办 Demo：需求 → 原型 → 预览 → iframe 点测） |
| M4 | Dev 工作台完善：真实预览运行时 + 调试 |
| M5 | 后端运行时 + 平台内数据库浏览/查询 |
| M6 | PM 完善：PRD、多页原型、评审批注与门禁 |
| M7 | QA 完善：内嵌浏览器、截图、缺陷回流 Session |
| M8 | 角色协作：登录、PM/前后端/QA、同一 Session 状态机 |
| M9 | Plugin Registry：现有工具收成可扩展协议 |
| M10 | 生产级：HTTPS、审计、多项目隔离 |

详细验收与刻意延后项见 [`docs/roadmap.md`](docs/roadmap.md)。架构见 [`docs/architecture.md`](docs/architecture.md)。

## License

MIT
