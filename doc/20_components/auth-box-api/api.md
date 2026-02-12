---
Title: Component API - auth-box-api
Scope: component
Owner: ai-agent
Status: active
LastUpdated: 2026-02-11
Related:
  - /doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md
  - /doc/20_components/auth-box-api/design.md
---

# auth-box-api API 契约（MVP）

## 基本约定
- Base: `/api/v1`
- Content-Type: `application/json`
- 时间：RFC3339
- ID：UUID
- 认证：除 `/health` 外，所有 `/api/v1/*` 必须携带 `Authorization: Bearer <token>`
- 调用来源：客户端可通过 `X-Auth-Source` 传递来源标识（默认 `api`）
- 不提供向后兼容层，升级即替换旧格式。

## 破坏性变更（2026-02-11）
- `AUTH_BOX_AUTH_TOKENS` 中若出现未注册角色或空角色，服务启动将失败（fail-fast），不再容忍错误 role 配置。
- 控制台调用默认会注入 `X-Auth-Source`，审计事件将按来源聚合；若调用方未同步该入口，审计来源将退回默认值。

## 鉴权与角色（MVP-1）
- Token Registry 由环境变量 `AUTH_BOX_AUTH_TOKENS` 提供，格式：
  - `token:actor_id:role1|role2,token2:actor2:roleA|roleB`
- 支持角色：`platform_admin` / `security_ops` / `compliance_auditor` / `policy_admin`。
- 若配置了未知角色，API 启动失败并报错（配置入口强校验）。
- 支持请求头 `X-Auth-Source` 标记调用来源（默认 `api`）。
- 本地默认 token：

| Token | Actor | Roles |
|---|---|---|
| `local-admin-token` | `actor-platform-admin` | `platform_admin`, `security_ops`, `compliance_auditor`, `policy_admin` |
| `local-security-token` | `actor-security-ops` | `security_ops` |
| `local-auditor-token` | `actor-compliance-auditor` | `compliance_auditor` |

## 配置入口（调用方同步）
| 变量 | 用途 | 默认值 |
|---|---|---|
| `AUTH_BOX_AUTH_TOKENS` | API 侧 token-actor-role 注册表 | 内置本地 3 个 token |
| `NEXT_PUBLIC_API_BASE_URL` | Console 调用 API base URL | `http://localhost:4010` |
| `AUTH_BOX_CONSOLE_API_TOKEN` | Console 服务端调用 token | `local-admin-token` |
| `AUTH_BOX_CONSOLE_AUTH_SOURCE` | Console 传递 `X-Auth-Source` | `console` |
| `NEXT_PUBLIC_API_TOKEN` | 浏览器端可选 token 覆盖 | 无（可选） |
| `NEXT_PUBLIC_API_AUTH_SOURCE` | 浏览器端可选来源覆盖 | 无（可选） |

## 错误格式

```
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "resource not found",
  "request_id": "req_123"
}
```

## 错误码列表（MVP）

| Code | HTTP | 场景 |
|---|---|---|
| VALIDATION_FAILED | 400 | 请求参数校验失败 |
| RESOURCE_NOT_FOUND | 404 | 资源不存在 |
| CONFLICT | 409 | 重复创建或状态冲突 |
| UNAUTHORIZED | 401 | 未认证或令牌失效 |
| FORBIDDEN | 403 | 权限不足 |
| RATE_LIMITED | 429 | 访问频率限制 |
| DEPENDENCY_FAILED | 502 | 外部平台调用失败 |
| INTERNAL_ERROR | 500 | 未知内部错误 |
| AUDIT_EXPORT_FAILED | 500 | 审计导出失败 |

## 权限矩阵（路由级）
| Endpoint | Method | 角色要求 |
|---|---|---|
| `/platforms` | GET | `platform_admin` / `security_ops` / `compliance_auditor` / `policy_admin` |
| `/platforms` | POST | `platform_admin` |
| `/platforms/{id}` | GET | `platform_admin` / `security_ops` / `compliance_auditor` / `policy_admin` |
| `/platforms/{id}` | PATCH | `platform_admin` |
| `/platforms/{id}` | DELETE | `platform_admin` |
| `/accounts` | GET | `platform_admin` / `security_ops` / `compliance_auditor` / `policy_admin` |
| `/accounts` | POST | `platform_admin` |
| `/accounts/{id}` | GET | `platform_admin` / `security_ops` / `compliance_auditor` / `policy_admin` |
| `/accounts/{id}` | PATCH | `platform_admin` |
| `/accounts/{id}` | DELETE | `platform_admin` |
| `/credentials` | GET | `platform_admin` / `security_ops` |
| `/credentials` | POST | `platform_admin` / `security_ops` |
| `/credentials/{id}/rotate` | POST | `security_ops` |
| `/credentials/{id}` | DELETE | `security_ops` |
| `/assistants` | GET | `platform_admin` / `security_ops` |
| `/assistants` | POST | `platform_admin` / `security_ops` |
| `/assistants/{id}` | GET | `platform_admin` / `security_ops` |
| `/assistants/{id}/bind` | POST | `security_ops` |
| `/audit` | GET | `platform_admin` / `compliance_auditor` |
| `/audit/exports` | POST | `compliance_auditor` |
| `/audit/exports/{id}` | GET | `platform_admin` / `compliance_auditor` |

## 通用分页

```
{
  "items": [],
  "next_page_token": ""
}
```

## 平台连接
- GET `/platforms`
- POST `/platforms`
- GET `/platforms/{id}`
- PATCH `/platforms/{id}`
- DELETE `/platforms/{id}`

示例：创建平台连接
```
POST /api/v1/platforms
{
  "name": "OpenAI",
  "type": "openai",
  "config": {
    "base_url": "https://api.openai.com",
    "auth_type": "api_key"
  }
}
```

响应：
```
{
  "id": "7d0b7c8f-3c3c-4b7d-9f4f-2f6f2f4c2a01",
  "name": "OpenAI",
  "type": "openai",
  "status": "active",
  "created_at": "2026-01-29T00:00:00Z"
}
```

## 账号
- POST `/accounts`
- GET `/accounts`
- GET `/accounts/{id}`
- PATCH `/accounts/{id}`
- DELETE `/accounts/{id}`

示例：创建账号
```
POST /api/v1/accounts
{
  "platform_id": "7d0b7c8f-3c3c-4b7d-9f4f-2f6f2f4c2a01",
  "display_name": "finance-bot"
}
```

响应：
```
{
  "id": "f4c2f48f-2b6c-4a6a-92b3-8f28b47d2a12",
  "platform_id": "7d0b7c8f-3c3c-4b7d-9f4f-2f6f2f4c2a01",
  "external_account_id": "ext_789",
  "status": "active",
  "created_at": "2026-01-29T00:00:00Z"
}
```

## 授权凭据
- POST `/credentials`
- POST `/credentials/{id}/rotate`
- DELETE `/credentials/{id}`
- GET `/credentials`

角色要求：
- `GET /credentials`: `platform_admin` or `security_ops`
- `POST /credentials`: `platform_admin` or `security_ops`
- `POST /credentials/{id}/rotate`: `security_ops`
- `DELETE /credentials/{id}`: `security_ops`

示例：创建凭据
```
POST /api/v1/credentials
{
  "account_id": "f4c2f48f-2b6c-4a6a-92b3-8f28b47d2a12",
  "type": "api_key",
  "expires_at": "2026-12-31T00:00:00Z"
}
```

响应：
```
{
  "id": "b6f7c2a8-5a7b-4f29-9d12-6dff02c3d4a9",
  "account_id": "f4c2f48f-2b6c-4a6a-92b3-8f28b47d2a12",
  "type": "api_key",
  "status": "active",
  "expires_at": "2026-12-31T00:00:00Z",
  "created_at": "2026-02-11T14:40:00Z",
  "updated_at": "2026-02-11T14:40:00Z"
}
```

## AI 助手
- POST `/assistants`
- POST `/assistants/{id}/bind`
- GET `/assistants`
- GET `/assistants/{id}`

角色要求：
- `GET /assistants`, `GET /assistants/{id}`: `platform_admin` or `security_ops`
- `POST /assistants`: `platform_admin` or `security_ops`
- `POST /assistants/{id}/bind`: `security_ops`

示例：创建助手
```
POST /api/v1/assistants
{
  "name": "ops-assistant",
  "description": "security operations assistant"
}
```

响应：
```
{
  "id": "0a9b2f1e-9f2c-4c3e-8a9d-4f2c3b1e9d0a",
  "name": "ops-assistant",
  "description": "security operations assistant",
  "status": "active",
  "created_at": "2026-02-11T14:40:00Z",
  "updated_at": "2026-02-11T14:40:00Z"
}
```

示例：绑定助手
```
POST /api/v1/assistants/2a3b6f0d-1a1b-4d7b-9e3a-2b9b6c1d7e11/bind
{
  "credential_id": "b6f7c2a8-5a7b-4f29-9d12-6dff02c3d4a9",
  "scope": {
    "resources": ["models"],
    "rate_limit": "1000/day"
  }
}
```

响应：
```
{
  "id": "0a9b2f1e-9f2c-4c3e-8a9d-4f2c3b1e9d0a",
  "name": "ops-assistant",
  "credential_id": "b6f7c2a8-5a7b-4f29-9d12-6dff02c3d4a9",
  "scope": {
    "resources": ["models"],
    "rate_limit": "1000/day"
  },
  "status": "active"
}
```

## 审计日志
- GET `/audit`
- POST `/audit/exports`
- GET `/audit/exports/{id}`

角色要求：
- `GET /audit`: `platform_admin` or `compliance_auditor`
- `POST /audit/exports`: `compliance_auditor`
- `GET /audit/exports/{id}`: `platform_admin` or `compliance_auditor`

### 审计事件类型（MVP）
- PLATFORM_CREATED
- PLATFORM_UPDATED
- PLATFORM_DELETED
- ACCOUNT_PROVISIONED
- ACCOUNT_STATUS_CHANGED
- CREDENTIAL_CREATED
- CREDENTIAL_ROTATED
- CREDENTIAL_REVOKED
- ASSISTANT_CREATED
- ASSISTANT_BOUND
- ASSISTANT_UNBOUND
- AUDIT_EXPORT_REQUESTED
- AUDIT_EXPORT_COMPLETED
- POLICY_DENIED（RBAC 拒绝）
- AUTHN_TOKEN_VALIDATE（Bearer Token 校验拒绝）

### 审计事件结构（MVP-1）
```
{
  "id": "uuid",
  "timestamp": "2026-02-11T15:00:00Z",
  "actor_id": "actor-security-ops",
  "source": "api",
  "action": "CREDENTIAL_ROTATED",
  "resource": "credential_uuid",
  "decision": "allow",
  "result": "success",
  "reason": "",
  "inputs_hash": "sha256_hex",
  "outputs_hash": "sha256_hex",
  "prev_event_hash": "sha256_hex_or_empty",
  "event_hash": "sha256_hex"
}
```

示例：创建审计导出
```
POST /api/v1/audit/exports
{
  "from": "2026-01-01T00:00:00Z",
  "to": "2026-01-31T23:59:59Z",
  "format": "csv"
}
```

响应：
```
{
  "id": "3f8a2f3d-2b4e-4f8c-9f1b-1c2a3d4e5f6a",
  "status": "queued",
  "from": "2026-01-01T00:00:00Z",
  "to": "2026-01-31T23:59:59Z",
  "format": "csv",
  "download_url": ""
}
```

## 监控与健康检查
- GET `/health`

响应：
```
{
  "status": "ok",
  "version": "0.1.0",
  "env": "local",
  "time": "2026-02-11T14:00:00Z"
}
```

## 真实 API Fixtures 与回放（Regression）
- Fixture 清单：`services/api/testdata/fixtures/real_api_core_flow/manifest.json`
- 真实采样（生成 fixtures）：`services/api/scripts/real_api_core_flow.sh --mode capture --project-dir .`
- 回放回归（真实 API）：`services/api/scripts/replay_real_api_fixtures.sh --project-dir .`
- 验收声明：最终验收必须通过真实 API，不得以 mock 替代。

## 契约测试（Contract Loop）
- 测试文件：`services/api/internal/server/contract_loop_test.go`
- 目标：
  - 核对状态码与错误码（401/403/400/202/200 等）
  - 核对权限模型（auditor/security_ops/admin）执行结果一致
  - 核对错误路径可追踪（request_id + code + message）
  - 核对来源透传（`X-Auth-Source` -> `audit.source`）与平台/账号审计事件落地
