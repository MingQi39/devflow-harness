# DevFlow Harness 架构

## 愿景

Web 研发工作台，不是 IDE 插件。一条 Session 贯穿：

```
PM：需求 → PRD / 原型 → 评审批注
Dev：生成 / 修改前后端代码 → 平台内预览 / 调试
QA：内嵌浏览器测试 → 平台内看库 → 缺陷回流同一 Session
```

内核学 Pi：**Session + Tools + 事件**。扩展学 DeepSeek：等工具都跑真了，再收成 **Plugin Registry**（M9）。

当前实现：**Harness Shell + 用户体系 + 多对话持久化 + SSE 流式通道 + Docker 公网部署**。

## 当前架构（M1 + 用户体系）

### 本地开发

```
React (5173) ──Vite /api proxy──► FastAPI (8000) ──► PostgreSQL (5432)
                                        │
                                        └──► LLM API
```

前端 `pnpm dev` 时，后端与 PostgreSQL 可本地运行，或通过 `docker compose up postgres` 只起数据库。

### 生产部署（flow.houmq.cn）

```
浏览器 → 主机 Nginx :80
           → frontend 容器 Nginx :8082
                ├─ /api/* → backend :8000
                └─ /*     → 静态 React
           backend → PostgreSQL (postgres 容器)
                 → OpenAI-compatible LLM API
```

frontend 容器映射宿主机 **8082**，由主机 Nginx 反代至 `flow.houmq.cn`。`docker-compose` 为三容器：`postgres` + `backend` + `frontend`。

### 后端模块

| 模块 | 职责 |
|------|------|
| `routers/auth.py` | 注册 / 登录 / 登出 / `/auth/me` |
| `routers/conversations.py` | 多对话 CRUD、分享开关 |
| `routers/chat.py` | SSE 流式聊天，history 从 DB 加载 |
| `routers/shared.py` | 公开分享只读 API |
| `deps.py` | JWT 解析、`require_permission()` RBAC |
| `seed.py` | 启动时 seed 权限与角色映射 |

### 前端路由

| 路径 | 鉴权 | 页面 |
|------|------|------|
| `/login` | 无 | 登录 |
| `/register` | 无 | 注册（含角色选择） |
| `/` | JWT | 聊天 + 侧边栏多对话 |
| `/share/:token` | 无 | 只读分享页 |

Token 存 `localStorage`，请求头 `Authorization: Bearer`。

## 关键设计

### 为什么 SSE？

AI 回复是单向流（服务器 → 客户端），SSE 足够且实现简单。WebSocket 留给后续双向协作（如 QA 实时事件、Agent 状态推送）。

### 为什么同步 `generate()`？

OpenAI Python SDK 的 `stream=True` 返回同步迭代器。使用同步生成器包装 SSE，避免 async/sync 混用导致 chunk 缓冲。

### 为什么 PostgreSQL？

多用户、多对话、消息持久化需要服务端存储。M1 原用 localStorage，现改为 PostgreSQL + SQLAlchemy，为 M2 Session 工作区铺路。

### 为什么 JWT 而非 Session Cookie？

SPA 前后端分离，JWT 存 localStorage + Authorization header 实现简单，7 天过期够用。Refresh token / 黑名单留到 M10。

### 为什么 Vite Proxy？

本地开发前后端分离，浏览器访问 `5173`，通过 proxy 转发 `/api` 到 `8000`，避免 CORS 配置干扰调试。

## 后续演进

先长内核和一条全角色闭环，再按角色加深，最后才抽插件协议：

```
Harness Core
├── Session / Project     (M2) ← conversations 可演进
├── Agent Loop + File IO  (M2)
├── Tools（挂在 Session 上，可随时加）
│   ├── 原型生成           (M3 最小 / M6 完善)
│   ├── 预览运行时 + 调试  (M3 iframe / M4 完善)
│   ├── 后端 + 数据浏览器  (M5)
│   └── 内嵌浏览器测试     (M3 点测 / M7 完善)
├── 角色协作 / 状态机      (M8) ← 用户/角色/RBAC 基础已就绪
└── Plugin Registry       (M9，从已有 Tools 收编)
```

完整里程碑与验收见 [`roadmap.md`](roadmap.md)。用户体系设计规格见 [`superpowers/specs/2026-09-16-m1-user-auth-design.md`](superpowers/specs/2026-09-16-m1-user-auth-design.md)。

## 参考

- [Pi Agent](https://github.com/earendil-works/pi) — Session、Lanes、Harness 事件模型
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — Everything-is-a-Plugin
