# M1 用户体系 + 多对话 + 分享 — 设计规格

> 日期：2026-09-16  
> 状态：待实现  
> 基于：M1 流式聊天骨架，提前引入原路线图 M8 的用户/角色能力

## 背景与目标

M1 已完成 SSE 流式聊天 + Docker 部署，但无数据库、无鉴权、消息仅存 localStorage。本规格在 M1 基础上增加：

1. **完整账号体系**：注册 / 登录 / 登出 / JWT
2. **角色与 RBAC**：注册时自选 PM / 前端 / 后端 / QA，权限框架可扩展
3. **多对话持久化**：每用户多条对话，消息存 PostgreSQL
4. **聊天分享**：分享链接未登录只读查看

## 架构决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 数据库 | PostgreSQL 16（Docker 第三容器） | 云服务器并发安全，为 M2 Session / M8 协作铺路 |
| ORM / 迁移 | SQLAlchemy 2.0 + Alembic | FastAPI 生态标准 |
| 鉴权 | JWT access token，7 天过期 | SPA 友好，localStorage + Authorization header |
| 密码 | bcrypt（passlib） | 行业标准 |
| 后端结构 | routers / models / schemas / deps 模块化 | auth + 多对话后 main.py 会膨胀 |
| RBAC | permissions + role_permissions 表 + require_permission() | M4/M6/M7 直接挂权限，M1 先 seed 占位 |
| 前端路由 | react-router-dom | 登录 / 注册 / 聊天 / 分享页 |
| 分享 | share_token 公开只读 API | 未登录 via 链接可看，普通聊天仍需登录 |

## 数据模型

### users

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | |
| email | string | UNIQUE, NOT NULL | 登录标识 |
| password_hash | string | NOT NULL | bcrypt |
| role | enum | NOT NULL | `pm` \| `frontend` \| `backend` \| `qa` |
| created_at | timestamp | NOT NULL | |
| updated_at | timestamp | NOT NULL | |

### conversations

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | |
| user_id | UUID | FK → users.id, NOT NULL | 所有者 |
| title | string | NOT NULL, default `新对话` | |
| share_token | string | UNIQUE, nullable | null = 未分享 |
| shared_at | timestamp | nullable | 开启分享时间 |
| created_at | timestamp | NOT NULL | |
| updated_at | timestamp | NOT NULL | 最后消息时间，列表排序用 |

索引：`user_id`, `share_token`（partial unique where not null）

### messages

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | |
| conversation_id | UUID | FK → conversations.id ON DELETE CASCADE | |
| role | enum | NOT NULL | `user` \| `assistant` \| `system` |
| content | text | NOT NULL | |
| created_at | timestamp | NOT NULL | |

索引：`conversation_id`, `(conversation_id, created_at)`

### permissions

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK | |
| code | string | UNIQUE, NOT NULL | 如 `chat:write` |
| description | string | NOT NULL | |

### role_permissions

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| role | enum | NOT NULL | 同 users.role |
| permission_id | UUID | FK → permissions.id | |

复合主键：`(role, permission_id)`

### ER 关系

```
users 1──* conversations 1──* messages
roles *──* permissions (via role_permissions)
```

## RBAC 权限 Seed

| 权限 code | PM | 前端 | 后端 | QA | M1 是否挂路由 |
|-----------|:--:|:----:|:----:|:--:|:-------------:|
| `chat:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `chat:write` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `conversation:manage` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `conversation:share` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `pm:manage_requirements` | ✓ | | | | 占位 |
| `dev:write_code` | | ✓ | ✓ | | 占位 |
| `qa:run_tests` | | | | ✓ | 占位 |

M1 四角色聊天体验一致；占位权限仅 seed，不拦截任何 M1 路由。

## API 规格

### 公开（无需 JWT）

| 方法 | 路径 | 请求体 | 响应 |
|------|------|--------|------|
| POST | `/auth/register` | `{ email, password, role }` | `{ token, user: { id, email, role }, permissions: string[] }` |
| POST | `/auth/login` | `{ email, password }` | 同上 |
| GET | `/shared/{share_token}` | — | `{ title, message_count, shared_at }` |
| GET | `/shared/{share_token}/messages` | — | `{ messages: [{ id, role, content, created_at }] }` |
| GET | `/health` | — | 不变 |

**register 校验：**
- email 格式合法、唯一
- password 最少 8 位
- role 必须是四枚举之一

**公开分享安全：**
- 不返回 owner email / user_id
- share_token 无效或已关闭 → 404
- 只读，无写操作

### 需 JWT（Authorization: Bearer）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/auth/me` | — | 当前用户 + permissions |
| POST | `/auth/logout` | — | 204，客户端清 token |
| GET | `/conversations` | `chat:read` | 当前用户对话列表，updated_at DESC |
| POST | `/conversations` | `conversation:manage` | `{ title? }` 新建 |
| PATCH | `/conversations/{id}` | `conversation:manage` | `{ title }` 重命名，仅 owner |
| DELETE | `/conversations/{id}` | `conversation:manage` | 删除对话及消息，仅 owner |
| GET | `/conversations/{id}/messages` | `chat:read` | 历史消息，仅 owner |
| POST | `/conversations/{id}/share` | `conversation:share` | 开启分享 → `{ share_url, share_token }` |
| DELETE | `/conversations/{id}/share` | `conversation:share` | 关闭分享 → 204 |
| GET | `/conversations/{id}/share` | `conversation:share` | `{ shared: bool, share_url? }` |
| POST | `/chat/stream` | `chat:write` | SSE，见下文 |

### `/chat/stream` 变更

**请求体：**
```json
{
  "conversation_id": "uuid",
  "message": "用户输入"
}
```

**流程：**
1. 校验 conversation 属于当前 user
2. 从 DB 加载该 conversation 全部 messages 作为 history
3. 追加当前 user message，调 LLM stream
4. SSE 流式返回（格式不变：`{ content }` / `[DONE]` / `{ error }`）
5. 流结束后：写入 user message + assistant message，更新 conversation.updated_at

**移除：** 前端传 `history` 数组；同步 `/chat` 端点加同样鉴权或移除。

### JWT

- Payload：`{ sub: user_id, role, exp }`
- 算法：HS256
- 过期：7 天（`JWT_EXPIRE_DAYS=7`）
- 密钥：`JWT_SECRET` 环境变量

### 错误码

| 状态码 | 场景 |
|--------|------|
| 401 | 无 token / token 无效 / 过期 |
| 403 | 无对应 permission / 非 conversation owner |
| 404 | 对话不存在 / share_token 无效 |
| 409 | email 已注册 |
| 422 | 参数校验失败 |

## 后端文件结构

```
backend/
├── main.py                 # FastAPI 入口，lifespan 里 migrate + seed
├── config.py               # Settings（DATABASE_URL, JWT_SECRET, …）
├── db.py                   # engine, SessionLocal, get_db
├── deps.py                 # get_current_user, require_permission
├── seed.py                 # permissions + role_permissions seed
├── models/
│   ├── __init__.py
│   ├── user.py
│   ├── conversation.py
│   ├── message.py
│   └── permission.py
├── schemas/
│   ├── auth.py
│   ├── conversation.py
│   └── chat.py
├── routers/
│   ├── auth.py
│   ├── conversations.py
│   ├── chat.py
│   └── shared.py           # 公开分享只读
├── alembic/
│   └── versions/001_initial.py
├── alembic.ini
└── requirements.txt        # 新增依赖
```

### 新增 Python 依赖

```
sqlalchemy>=2.0
alembic
psycopg2-binary
python-jose[cryptography]
passlib[bcrypt]
```

### RBAC 核心接口

```python
def require_permission(code: str) -> Callable:
    """FastAPI Depends：无权限抛 403"""

def user_has_permission(db: Session, role: str, code: str) -> bool:
    """查 role_permissions"""

def get_current_user(token: str = Depends(oauth2_scheme), db = Depends(get_db)) -> User:
    """解析 JWT，加载 user"""
```

## 前端结构

```
frontend/src/
├── App.tsx
├── contexts/AuthContext.tsx
├── pages/
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx      # 含角色下拉
│   ├── ChatPage.tsx          # 侧边栏 + 聊天区
│   └── SharePage.tsx         # 只读分享页
├── components/
│   ├── ConversationSidebar.tsx
│   ├── ShareButton.tsx
│   └── ProtectedRoute.tsx
├── lib/
│   ├── api.ts                # fetch + Authorization
│   └── streamChat.ts         # conversation_id 替代 history
└── types/
    ├── auth.ts
    └── chat.ts
```

### 路由

| 路径 | 鉴权 | 页面 |
|------|------|------|
| `/login` | 无 | LoginPage |
| `/register` | 无 | RegisterPage |
| `/` | 需登录 | ChatPage |
| `/share/:token` | 无 | SharePage（只读） |

### 用户流程

1. 未登录访问 `/` → 重定向 `/login`
2. 注册：邮箱 + 密码 + 角色 → 自动登录 → `/`
3. ChatPage：加载对话列表，默认选中最新；无对话则自动新建
4. 切换对话 → GET messages；发消息 → SSE；不再使用 localStorage 存消息
5. 分享：开启 → 复制 `https://flow.houmq.cn/share/{token}`；关闭后链接 404
6. 未登录打开 `/share/:token` → 只读消息，顶栏「登录以开始对话」

### 新增前端依赖

```
react-router-dom
```

### 移除

- `frontend/src/lib/storage.ts` 的消息持久化逻辑（可删除文件）

## 部署

### docker-compose 变更

新增 `postgres` 服务 + `pgdata` volume；backend `depends_on` postgres healthy。

```yaml
postgres:
  image: postgres:16-alpine
  restart: unless-stopped
  environment:
    POSTGRES_DB: devflow
    POSTGRES_USER: devflow
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  volumes:
    - pgdata:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U devflow -d devflow"]
    interval: 10s
    timeout: 5s
    retries: 5
```

### 环境变量（.env.example 更新）

```env
# 已有
OPENAI_API_KEY=
OPENAI_BASE_URL=
MODEL=
CORS_ORIGINS=

# 新增
POSTGRES_PASSWORD=
DATABASE_URL=postgresql://devflow:${POSTGRES_PASSWORD}@postgres:5432/devflow
JWT_SECRET=
JWT_EXPIRE_DAYS=7
```

### 启动顺序

postgres healthy → backend 启动 → Alembic upgrade head → seed permissions → 就绪

### 本地开发

`docker compose up` 三容器；或本地 PostgreSQL + 对应 DATABASE_URL。

## 与路线图关系

| 原里程碑 | 本规格覆盖 | 剩余 |
|----------|-----------|------|
| M1 对话通道 | 保留 SSE 流式 | — |
| M2 Session | conversations 可演进为 Session | 文件树、Agent Loop |
| M8 角色协作 | 用户/角色/RBAC 基础 | 多人同 Session、权限拦截业务 |
| M10 生产级 | PostgreSQL 持久化 | HTTPS 完善、审计、多项目隔离 |

## 验收标准

### 账号
- [ ] 注册（邮箱 + 密码 + 选角色）成功并自动登录
- [ ] 登录 / 登出正常
- [ ] token 过期或无效 → 401 → 前端跳转登录
- [ ] `/auth/me` 返回 user + permissions

### 多对话
- [ ] 新建 / 切换 / 重命名 / 删除对话
- [ ] 流式聊天，消息持久化 DB，刷新后仍在
- [ ] 对话列表按 updated_at 排序
- [ ] 未登录访问 `/` → 跳转登录

### 分享
- [ ] 开启分享 → 复制链接
- [ ] 未登录打开分享链接 → 只读查看，不能发消息
- [ ] 关闭分享 → 旧链接 404
- [ ] 分享页不泄露 owner 信息

### RBAC
- [ ] 各角色 permissions 与 seed 一致
- [ ] 无 permission 时接口返回 403（可通过测试去掉某映射验证）

### 部署
- [ ] docker-compose 三容器本地运行
- [ ] 云服务器 flow.houmq.cn 部署验证

## 非目标（本规格不做）

- 邮箱验证 / 找回密码
- JWT 黑名单 / refresh token
- 管理员后台改角色
- 分享链接过期时间 / 密码保护
- 多人协作编辑同一对话
- 迁移 localStorage 历史消息（用户重新开对话）
