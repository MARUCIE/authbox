---
Title: Component Runbook - auth-box-console
Scope: component
Owner: ai-agent
Status: active
LastUpdated: 2026-02-11
Related:
  - /doc/20_components/auth-box-console/index.md
---

# auth-box-console 运行手册

## 本地启动
```
cd apps/console
npm install
npm run dev
```

## 环境变量
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:4010
AUTH_BOX_CONSOLE_API_TOKEN=local-admin-token
AUTH_BOX_CONSOLE_AUTH_SOURCE=console
# optional browser-side overrides
NEXT_PUBLIC_API_TOKEN=
NEXT_PUBLIC_API_AUTH_SOURCE=
```
