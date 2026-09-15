# DevFlow Harness 架构（M1）

## 愿景

构建一个插件化 Agent Harness 研发平台：

```
PM：需求 → PRD / 原型 → 评审
Dev：生成 / 修改代码 → 平台内预览 / 调试
QA：内嵌浏览器测试 → 数据库查看
```

M1 只实现最底层：**Harness Shell + 流式对话通道**。

## M1 架构

```
┌──────────────────────────────────────────────┐
│              React Shell (5173)              │
│  Chat UI · Markdown · localStorage           │
└────────────────────┬─────────────────────────┘
                     │ /api/* (Vite proxy)
                     ▼
┌──────────────────────────────────────────────┐
│           FastAPI Harness Core (8000)        │
│  POST /chat        非流式                     │
│  POST /chat/stream SSE 流式                   │
└────────────────────┬─────────────────────────┘
                     │
                     ▼
            OpenAI-compatible LLM API
```

## 关键设计

### 为什么 SSE？

AI 回复是单向流（服务器 → 客户端），SSE 足够且实现简单。WebSocket 留给后续双向协作（如 QA 实时事件、Agent 状态推送）。

### 为什么同步 `generate()`？

OpenAI Python SDK 的 `stream=True` 返回同步迭代器。M1 使用同步生成器包装 SSE，避免 async/sync 混用导致 chunk 缓冲。

### 为什么 Vite Proxy？

本地开发前后端分离，浏览器访问 `5173`，通过 proxy 转发 `/api` 到 `8000`，避免 CORS 配置干扰调试。

## 后续演进（M2+）

```
Harness Core
├── Plugin Registry      (M2)
├── Agent Loop           (M3)
├── Session / Project    (M5)
└── Role Plugins
    ├── PM Plugin        (M6)
    ├── Dev Plugin       (M3+)
    └── QA Plugin        (M7)
```

## 参考

- [Pi Agent](https://github.com/earendil-works/pi) — Session、Lanes、Harness 事件模型
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — Everything-is-a-Plugin
