---
Title: Component API - auth-box-api
Scope: component
Owner: ai-agent
Status: active
LastUpdated: 2026-01-29
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
- 认证：`Authorization: Bearer <token>`
- 不提供向后兼容层，升级即替换旧格式。

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
  "status": "active",
  "created_at": "2026-01-29T00:00:00Z"
}
```

## AI 助手
- POST `/assistants`
- POST `/assistants/{id}/bind`
- GET `/assistants`
- GET `/assistants/{id}`

示例：绑定助手
```
POST /api/v1/assistants/2a3b6f0d-1a1b-4d7b-9e3a-2b9b6c1d7e11/bind
{
  "credential_id": "b6f7c2a8-5a7b-4f29-9d12-6dff02c3d4a9",
  "scope": {
    "resources": ["models", "files"],
    "rate_limit": "1000/day"
  }
}
```

响应：
```
{
  "id": "0a9b2f1e-9f2c-4c3e-8a9d-4f2c3b1e9d0a",
  "assistant_id": "2a3b6f0d-1a1b-4d7b-9e3a-2b9b6c1d7e11",
  "credential_id": "b6f7c2a8-5a7b-4f29-9d12-6dff02c3d4a9",
  "status": "active"
}
```

## 审计日志
- GET `/audit`
- POST `/audit/exports`
- GET `/audit/exports/{id}`

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

示例：导出审计日志
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
  "download_url": ""
}
```

## 监控与健康检查
- GET `/health`

响应：
```
{
  "status": "ok",
  "version": "0.1.0"
}
```
