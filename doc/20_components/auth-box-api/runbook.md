---
Title: Component Runbook - auth-box-api
Scope: component
Owner: ai-agent
Status: active
LastUpdated: 2026-02-11
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
