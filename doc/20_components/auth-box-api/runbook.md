---
Title: Component Runbook - auth-box-api
Scope: component
Owner: ai-agent
Status: active
LastUpdated: 2026-06-01
Related:
  - /doc/20_components/auth-box-api/api.md
---

# auth-box-api 运行手册

## 本地启动（占位）
```
docker compose up -d
```

## 健康检查
```
curl -s http://localhost:4010/health
```

## VPS 生产恢复入口

目标拓扑：Cloudflare Tunnel -> `127.0.0.1:4010` -> Go API -> PostgreSQL。不要用根目录 `docker-compose.yml` 直接在 VPS 启动生产运行态，因为它是本地开发拓扑，会把 3010/4010/5410 绑定到公开接口。

预检：
```
git -C /root/10-auth-box fetch origin main
git -C /root/10-auth-box checkout main
git -C /root/10-auth-box pull --ff-only
cd /root/10-auth-box
```

必需环境变量由 shell 或仅限服务器本地读取的 env 文件提供，禁止写入仓库：
```
export AUTH_BOX_POSTGRES_PASSWORD='<server-local-secret>'
export AUTH_BOX_DB_DSN='postgres://auth_box:<server-local-secret>@postgres:5432/auth_box?sslmode=disable'
export AUTH_BOX_TOTP_SECRET_KEY='<base64-32-byte-key>'
export AUTH_BOX_ALLOWED_ORIGINS='https://authbox.io,https://www.authbox.io'
```

启动与本机验证：
```
docker compose -f docker-compose.vps.yml config
docker compose -f docker-compose.vps.yml up -d --build
curl -fsS http://127.0.0.1:4010/health
```

DNS/Tunnel 恢复条件：
- Cloudflare zone owning `authbox.io` must have a public `api.authbox.io` record.
- If using Cloudflare Tunnel, route `api.authbox.io` to the tunnel and ingress `http://127.0.0.1:4010`.
- Public release remains blocked until `dig @1.1.1.1 api.authbox.io` is non-NXDOMAIN and `curl -fsS https://api.authbox.io/health` returns 200.

## 鉴权与来源示例
```
curl -s \
  -H "Authorization: Bearer local-admin-token" \
  -H "X-Auth-Source: console" \
  http://localhost:4010/api/v1/platforms
```

## 凭据轮换操作
- 使用 `/api/v1/credentials/{id}/rotate` 触发轮换。
- 轮换后旧凭据标记为 rotated。

## 审计导出
- 使用 `/api/v1/audit/exports` 生成导出任务。
- 下载地址由后台异步生成。

## Changelog
- 2026-06-01: 新增 VPS 生产恢复入口，明确使用 `docker-compose.vps.yml` 只绑定 loopback，并把 public API health 的 DNS/Tunnel 验收条件写入 runbook。（原因：public API health blocker triage）
