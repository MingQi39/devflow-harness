# DevFlow Harness 架构

## 愿景

Web 研发工作台，不是 IDE 插件。一条 Session 贯穿：

```
PM：需求 → PRD / 原型 → 评审批注
Dev：生成 / 修改前后端代码 → 平台内预览 / 调试
QA：内嵌浏览器测试 → 平台内看库 → 缺陷回流同一 Session
```

内核学 Pi：**Session + Tools + 事件**。扩展学 DeepSeek：等工具都跑真了，再收成 **Plugin Registry**（M9）。

当前实现：**Harness Shell + Session 工作区 + Agent Loop + 阶段闭环 + 用户体系 + SSE 流式通道 + Docker 公网部署**。

## 当前架构（M3）

### 本地开发

```
React (5173) ──Vite /api proxy──► FastAPI (8000) ──► PostgreSQL (5432)
                                        │
                                        ├──► LLM API (tool calling)
                                        └──► Session workspaces/ (磁盘)
```

前端 `pnpm dev` 时，后端与 PostgreSQL 可本地运行，或通过 `docker compose up postgres` 只起数据库。每个 Session（conversation）对应 `WORKSPACES_ROOT/{uuid}/` 目录。

### 生产部署（flow.houmq.cn）

```
浏览器 → 主机 Nginx :80
           → frontend 容器 Nginx :8082
                ├─ /api/* → backend :8000
                └─ /*     → 静态 React
           backend → PostgreSQL (postgres 容器)
                 → OpenAI-compatible LLM API
                 → workspaces volume (/app/workspaces)
```

frontend 容器映射宿主机 **8082**，由主机 Nginx 反代至 `flow.houmq.cn`。`docker-compose` 为三容器 + workspaces 持久化卷。

### 后端模块

| 模块 | 职责 |
|------|------|
| `routers/auth.py` | 注册 / 登录 / 登出 / `/auth/me` |
| `routers/conversations.py` | Session CRUD、阶段推进、分享开关、创建工作区 |
| `routers/files.py` | Session 文件树、读文件内容 |
| `routers/chat.py` | SSE Agent Loop 流式聊天 |
| `routers/shared.py` | 公开分享只读 API |
| `services/agent_loop.py` | 多轮 tool calling 循环 |
| `services/agent_tools.py` | `read_file` / `write_file` 定义与执行 |
| `services/session_stage.py` | 需求 → 原型 → 开发 → 提测 阶段机与 Agent 提示 |
| `services/workspace.py` | 工作目录、路径安全、文件树 |
| `deps.py` | JWT 解析、`require_permission()` RBAC |
| `seed.py` | 启动时 seed 权限与角色映射 |

### 前端布局

| 区域 | 组件 |
|------|------|
| 左栏 | `ConversationSidebar` — Session 列表（带阶段） |
| 中栏 | `FileTreePanel` — 项目文件树 + iframe 预览 |
| 右栏 | 聊天区 — `StageBar` + Agent 回复 + 输入框 |

### Agent Loop 事件（SSE）

| 事件 type | 含义 |
|-----------|------|
| `content` | 模型文本增量 |
| `tool_call` | 即将执行工具 |
| `tool_result` | 工具返回 |
| `file_changed` | 工作区文件变更，前端刷新文件树 |
| `stopped` | 客户端断开 / 用户停止 |
| `done` | 本轮 Loop 结束 |

## 关键设计

### 为什么 conversations 演进为 Session？

M1.5 的多对话已是「用户维度隔离 + 消息持久化」。M2 给每条 conversation 绑定磁盘工作区，语义上即 Session，API 路径保持 `/conversations` 兼容。

### 为什么工具限制在工作区内？

`safe_resolve()` 禁止 `..` 与绝对路径，防止 Agent 或 prompt 注入读写宿主机任意文件。

### 为什么 SSE 而非 WebSocket？

AI 回复仍是单向流；tool 事件穿插在同一条 SSE 里足够。WebSocket 留给 M7/M8 双向协作。

### 为什么 M3 用阶段机而不是完整角色门禁？

Session 阶段线性存在 DB 上（需求 → 原型 → 开发 → 提测 → 已提测）。M3 已按角色限制**谁可以点「推进」**：PM 负责需求/原型并「评审通过，移交开发」；前端/后端在开发阶段提交测试；QA 在提测阶段点通过。多人同 Session、评审批注等仍留给 M8。

### 为什么 prototype.html 和 index.html 分开？

原型是 PM 可点的草稿，开发页是对应实现。分开后 QA 仍能对照，也避免「进入开发」时把原型覆盖掉。

### 为什么预览用 srcDoc iframe？

M3 只要静态 HTML 能在工作台里勾选待办。独立预览运行时、热更新、控制台叠层是 M4。

## 后续演进

```
Harness Core
├── Session / Project     (M2) ✅
├── Agent Loop + File IO  (M2) ✅
├── Session 阶段机 + iframe 点测 (M3)
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
