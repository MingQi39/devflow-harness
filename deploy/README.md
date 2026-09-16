# Docker 部署（flow.houmq.cn）

生产环境通过 Docker 部署，frontend 容器映射宿主机端口 **8082**。

## 架构

```text
浏览器 → http://flow.houmq.cn (主机 Nginx :80)
           → frontend Nginx (127.0.0.1:8082)
                ├─ /api/* → backend (FastAPI :8000)
                └─ 其余路径 → 静态 React SPA
           backend → postgres (PostgreSQL :5432, 容器内)
                 → OpenAI-compatible LLM API
```

三容器：`postgres` + `backend` + `frontend`。backend 启动时自动 Alembic 迁移 + seed RBAC 权限。

## 前置条件

- 服务器已安装 Docker 与 Docker Compose v2
- DNS：`flow.houmq.cn` A 记录指向服务器公网 IP
- 安全组放行 **80**（HTTPS 按需放行 443）
- GitHub Actions Secrets：
  - `DEPLOY_USER`
  - `DEPLOY_HOST`
  - `FEISHU_APP_SECRET`（可选，部署飞书通知）

## 服务器首次初始化

```bash
# 1. 创建部署目录
sudo mkdir -p /home/ubuntu/devflow-harness
sudo chown ubuntu:ubuntu /home/ubuntu/devflow-harness

# 2. 配置环境变量（在服务器上）
cd /home/ubuntu/devflow-harness
cp .env.docker.example .env   # 或手动创建
nano .env                     # 填写 OPENAI_API_KEY、POSTGRES_PASSWORD、JWT_SECRET、APP_PUBLIC_URL 等

# 3. 主机 Nginx
sudo cp deploy/nginx-flow.houmq.cn.conf /etc/nginx/sites-available/flow.houmq.cn
sudo ln -sf /etc/nginx/sites-available/flow.houmq.cn /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 自动部署（GitHub Actions）

`main` 分支 push 后：

1. GitHub ubuntu runner 构建 Docker 镜像
2. Mac self-hosted runner 加载镜像并 SSH 到服务器
3. 同步 `docker-compose.server.yml` 到 `/home/ubuntu/devflow-harness`
4. `docker compose up -d --no-build`

## 手动部署（服务器本地构建）

```bash
cd /home/ubuntu/devflow-harness
docker compose -f docker-compose.server.yml up -d --build
docker compose -f docker-compose.server.yml ps
docker compose -f docker-compose.server.yml logs -f backend
```

## 访问

- 生产：**http://flow.houmq.cn/**
- 容器直连（调试）：`http://<服务器IP>:8082`

## HTTPS（可选）

```bash
sudo certbot certonly --webroot -w /var/www/html -d flow.houmq.cn
# 然后编辑 deploy/nginx-flow.houmq.cn.conf 启用 443 段
sudo nginx -t && sudo systemctl reload nginx
# .env 中 CORS_ORIGINS 增加 https://flow.houmq.cn
```

## 故障排查

| 现象 | 检查 |
|------|------|
| 502 | `docker compose logs backend`、8082 端口是否监听 |
| API 失败 | frontend nginx `/api/` 是否转发到 backend |
| SSE 不流式 | nginx `proxy_buffering off`、后端日志 |
| CORS | `.env` 中 `CORS_ORIGINS` 是否含 `http://flow.houmq.cn` |
| 登录失败 / 401 | `JWT_SECRET` 是否配置；postgres 是否 healthy |
| 分享链接不对 | `APP_PUBLIC_URL` 是否指向 `https://flow.houmq.cn` |
| 数据库连接失败 | `POSTGRES_PASSWORD` 与 `DATABASE_URL` 是否一致 |
