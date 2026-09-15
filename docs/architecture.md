# DevFlow Harness 架构

## 愿景

Web 研发工作台，不是 IDE 插件。一条 Session 贯穿：

```
PM：需求 → PRD / 原型 → 评审批注
Dev：生成 / 修改前后端代码 → 平台内预览 / 调试
QA：内嵌浏览器测试 → 平台内看库 → 缺陷回流同一 Session
```

内核学 Pi：**Session + Tools + 事件**。扩展学 DeepSeek：等工具都跑真了，再收成 **Plugin Registry**（M9）。

M1 实现：**Harness Shell + 流式对话通道 + Docker 公网部署**。

## M1 架构

### 本地开发

```
React (5173) ──Vite /api proxy──► FastAPI (8000) ──► LLM API
```

### 生产部署（flow.houmq.cn）

```
浏览器 → 主机 Nginx :80
           → frontend 容器 Nginx :8082
                ├─ /api/* → backend :8000
                └─ /*     → 静态 React
           backend → OpenAI-compatible LLM API
```

frontend 容器映射宿主机 **8082**，由主机 Nginx 反代至 `flow.houmq.cn`。

## 关键设计

### 为什么 SSE？

AI 回复是单向流（服务器 → 客户端），SSE 足够且实现简单。WebSocket 留给后续双向协作（如 QA 实时事件、Agent 状态推送）。

### 为什么同步 `generate()`？

OpenAI Python SDK 的 `stream=True` 返回同步迭代器。M1 使用同步生成器包装 SSE，避免 async/sync 混用导致 chunk 缓冲。

### 为什么 Vite Proxy？

本地开发前后端分离，浏览器访问 `5173`，通过 proxy 转发 `/api` 到 `8000`，避免 CORS 配置干扰调试。

## 后续演进

先长内核和一条全角色闭环，再按角色加深，最后才抽插件协议：

```
Harness Core
├── Session / Project     (M2)
├── Agent Loop + File IO  (M2)
├── Tools（挂在 Session 上，可随时加）
│   ├── 原型生成           (M3 最小 / M6 完善)
│   ├── 预览运行时 + 调试  (M3 iframe / M4 完善)
│   ├── 后端 + 数据浏览器  (M5)
│   └── 内嵌浏览器测试     (M3 点测 / M7 完善)
├── 角色协作 / 状态机      (M8)
└── Plugin Registry       (M9，从已有 Tools 收编)
```

完整里程碑与验收见 [`roadmap.md`](roadmap.md)。

## 参考

- [Pi Agent](https://github.com/earendil-works/pi) — Session、Lanes、Harness 事件模型
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — Everything-is-a-Plugin
