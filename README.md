# Auth Box

## 概述
Auth Box 是接口授权管理平台的骨架工程，聚焦多平台账号创建、授权治理与 AI 助手接入。

## 本地启动（最小链路）

```
docker compose up -d
```

- 控制台：`http://localhost:3010`（或运行 `docker compose port console 3000` 获取映射端口）
- API 健康检查：`http://localhost:4010/health`
- PostgreSQL：仅容器内访问（如需宿主访问请在 compose 中显式映射端口）
- Redis：仅容器内访问（如需宿主访问请在 compose 中显式映射端口）

## API 鉴权（MVP-1）
- `/health` 无需鉴权。
- 其余 `/api/v1/*` 必须带 Bearer token。
- 可选请求头：`X-Auth-Source`（用于审计来源标记，默认 `api`）。

本地默认 token：
- `local-admin-token`
- `local-security-token`
- `local-auditor-token`

示例：
```
curl -H "Authorization: Bearer local-admin-token" \
  -H "X-Auth-Source: console" \
  http://localhost:4010/api/v1/platforms
```

### 破坏性变更（2026-02-11）
- `AUTH_BOX_AUTH_TOKENS` 启用 role 白名单校验；未知 role 或空 role 会导致 API 启动失败（fail-fast）。

## 真实 API Fixtures（回放回归）
- 采样（真实 API -> fixtures）：`make real-api-capture`
- 回放（真实 API 回归）：`make real-api-replay`
- 清单：`services/api/testdata/fixtures/real_api_core_flow/manifest.json`
- 约束：最终验收必须通过真实 API，不得以 mock 替代。

## 功能闭环检查
- 一键检查入口/系统/契约/验证闭环：`make full-loop-check`
- 脚本：`scripts/full_loop_closure_check.sh`

## 开发说明

```
cd services/api
# Go 环境未安装时请先安装 Go 1.22+

go run ./cmd/api
```

```
cd apps/console
npm install
npm run dev
```

## 目录结构

```
apps/console        # Next.js console
services/api        # Go API service
cat doc/index.md    # documentation index
```
