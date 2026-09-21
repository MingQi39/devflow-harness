# DevFlow Harness 桌面端（Electron）

用系统文件夹选择器导入本地项目（类似 Cursor / VS Code「打开文件夹」），无需手动打 ZIP。

## 前置

与 [根目录 README](../README.md) 相同：PostgreSQL、后端 `8000`、前端 Vite `5173`。

后端 **必须** 开启本机目录绑定（与后端同机时直接读写本地仓库；原型/需求在平台查看，不写入仓库 `docs/`）：

```bash
# backend/.env
ALLOW_LOCAL_PATH_IMPORT=true
```

连接线上 `flow.houmq.cn` 时若未开启上述配置，桌面端会自动改为打包 ZIP 后上传（跳过 `node_modules`、`venv`、`.git` 等常见大目录；压缩包上限 50MB）。

## 启动

```bash
# 终端 1：后端（含 ALLOW_LOCAL_PATH_IMPORT=true）
cd backend && source venv/bin/activate && uvicorn main:app --reload --host 127.0.0.1 --port 8000

# 方式 A（推荐，一条命令，同 moreai-electron 的 electron:dev）
cd desktop && npm install && pnpm electron:dev

# 方式 B（三个终端）
# 终端 2：前端
cd frontend && pnpm dev
# 终端 3：Electron
cd desktop && pnpm start
```

可选环境变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `DEVFLOW_APP_URL` | `http://127.0.0.1:5173` | 加载的 Web UI |
| `DEVFLOW_API_URL` | `http://127.0.0.1:8000` | ZIP 回退上传时的 API 根（无 `/api` 前缀） |
| `DEVFLOW_DEVTOOLS` | — | 设为 `1` 打开 DevTools |

## 架构

```
Electron BrowserWindow → Vite (5173) → /api proxy → FastAPI (8000)
        │
        └─ preload: pickProjectDirectory / uploadProjectDirectory
```

导入流程见 `frontend/src/lib/projectImport.ts`：优先 `POST .../import/local`，403 时由主进程打 ZIP 调 `POST .../import`。
