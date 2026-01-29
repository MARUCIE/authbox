---
Title: Component Config - auth-box-api
Scope: component
Owner: ai-agent
Status: active
LastUpdated: 2026-01-29
Related:
  - /doc/20_components/auth-box-api/design.md
---

# auth-box-api 配置

## 配置项（占位符示例）

```
AUTH_BOX_DB_DSN=postgres://user:pass@localhost:5432/auth_box
AUTH_BOX_REDIS_URL=redis://localhost:6379/0
AUTH_BOX_KMS_KEY_ID=kms-key-id-placeholder
AUTH_BOX_OBJECT_STORE_URL=s3://audit-bucket
AUTH_BOX_OBJECT_STORE_REGION=us-east-1
AUTH_BOX_OTEL_ENDPOINT=http://localhost:4317
```

## 说明
- 敏感信息仅使用占位符，禁止明文写入文档与代码。
- API Key 与密文优先存储数据库，不从环境变量读取业务凭据。
