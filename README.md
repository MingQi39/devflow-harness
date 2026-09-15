# DevFlow Harness

多角色 Agent 研发平台 —— 参考 [Pi Agent](https://github.com/earendil-works/pi) 与 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，用 **Python Harness 内核 + React 工作台** 逐步演进，服务 PM / Dev / QA 全链路协作。

> 当前版本：**M1 — Harness 骨架 + SSE 流式对话**

## 当前能力（M1）

- FastAPI 后端：`/chat`、`/chat/stream`（SSE）
- React 前端：流式打字机效果、Markdown 渲染
- 停止生成 / 清空对话
- localStorage 本地持久化
- Vite 开发代理，避免本地 CORS 问题

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.11+ · FastAPI · OpenAI SDK |
| 前端 | React 18 · TypeScript · Vite · react-markdown |
| 模型 | OpenAI 兼容 API（DeepSeek / OpenAI 等） |

## 快速开始

### 1. 后端

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env         # 填写 OPENAI_API_KEY / BASE_URL / MODEL
uvicorn main:app --reload --port 8000
```

### 2. 前端

```bash
cd frontend
pnpm install
pnpm dev
```

浏览器访问：http://localhost:5173

## 环境变量

见 [`backend/.env.example`](backend/.env.example)。

## 路线图

| 里程碑 | 目标 |
|--------|------|
| **M1** | Harness 骨架 + SSE 流式对话 ✅ |
| M2 | 插件协议 + Dev 插件 |
| M3 | Agent Loop + 文件工具 |
| M4 | 平台内预览 |
| M5 | Project Session |
| M6 | PM 插件（需求 → PRD / 原型） |
| M7 | QA 插件（内嵌浏览器） |
| M8 | Docker 部署 + 公网 Demo |

架构说明见 [`docs/architecture.md`](docs/architecture.md)。

## License

MIT
