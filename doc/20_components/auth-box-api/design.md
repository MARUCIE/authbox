---
Title: Component Design - auth-box-api
Scope: component
Owner: ai-agent
Status: active
LastUpdated: 2026-02-11
Related:
  - /doc/00_project/initiative_10_auth_box/PRD.md
  - /doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md
  - /doc/20_components/auth-box-api/api.md
---

# auth-box-api 设计

## 目标
- 定义 MVP 数据模型与核心流程，确保授权与审计可追溯。

## 核心实体
- 平台连接（platforms）
- 账号（accounts）
- 授权凭据（credentials）
- AI 助手（assistants）
- 绑定关系（assistant_bindings）
- 审计日志（audit_logs）
- 角色与权限（role_bindings）

## 数据模型（MVP）

### platforms
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 主键 |
| name | text | 平台名称 |
| type | text | 平台类型 |
| status | text | active/disabled |
| config | jsonb | 连接配置（密文） |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### accounts
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 主键 |
| platform_id | uuid | 平台连接 |
| external_account_id | text | 外部平台账号 ID |
| display_name | text | 展示名称 |
| status | text | active/suspended/closed |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### credentials
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 主键 |
| account_id | uuid | 账号 |
| type | text | api_key/oauth_token |
| status | text | active/rotated/revoked |
| ciphertext | bytea | 加密密文 |
| key_id | text | KMS key id |
| iv | bytea | 初始化向量 |
| tag | bytea | 认证标签 |
| expires_at | timestamptz | 过期时间 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### assistants
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 主键 |
| name | text | 助手名称 |
| owner_id | uuid | 所有者 |
| status | text | active/disabled |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### assistant_bindings
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 主键 |
| assistant_id | uuid | 助手 |
| credential_id | uuid | 授权凭据 |
| scope | jsonb | 权限范围 |
| status | text | active/disabled |
| created_at | timestamptz | 创建时间 |

### audit_logs
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 主键 |
| event_type | text | 事件类型 |
| actor_id | uuid | 操作人 |
| resource_type | text | 资源类型 |
| resource_id | uuid | 资源 ID |
| metadata | jsonb | 事件详情 |
| created_at | timestamptz | 创建时间 |

### role_bindings
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 主键 |
| subject_id | uuid | 用户/服务 |
| role | text | admin/engineer/auditor |
| scope | jsonb | 作用域 |
| created_at | timestamptz | 创建时间 |

## 状态枚举

```
platform_status: active | disabled
account_status: active | suspended | closed
credential_status: active | rotated | revoked
assistant_status: active | disabled
binding_status: active | disabled
```

## 关键约束
- 审计日志 append-only，不可修改与删除。
- 凭据密文与配置密文均使用信封加密。
- 所有写操作必须生成审计日志。

## 错误码模型（MVP）
- 统一返回 `code` 与 `message`，并附带 `request_id` 便于追踪。
- 业务错误与外部依赖失败必须显式区分（例如 `DEPENDENCY_FAILED`）。

## 审计事件字典（MVP）
| event_type | resource_type | 触发时机 |
|---|---|---|
| PLATFORM_CREATED | platform | 创建平台连接 |
| PLATFORM_UPDATED | platform | 更新平台配置 |
| PLATFORM_DELETED | platform | 删除平台连接 |
| ACCOUNT_PROVISIONED | account | 账号创建成功 |
| ACCOUNT_STATUS_CHANGED | account | 账号状态变更 |
| CREDENTIAL_CREATED | credential | 创建凭据 |
| CREDENTIAL_ROTATED | credential | 轮换凭据 |
| CREDENTIAL_REVOKED | credential | 吊销凭据 |
| ASSISTANT_CREATED | assistant | 注册助手 |
| ASSISTANT_BOUND | assistant_binding | 绑定助手与凭据 |
| ASSISTANT_UNBOUND | assistant_binding | 解绑助手 |
| AUDIT_EXPORT_REQUESTED | audit_export | 发起审计导出 |
| AUDIT_EXPORT_COMPLETED | audit_export | 审计导出完成 |
| AUTHN_TOKEN_VALIDATE | auth | Bearer token 校验拒绝（401） |

## 迁移策略（MVP-0）
- 采用 SQL 迁移文件做版本化管理，保证单一事实源。
- 迁移目录建议：`services/api/migrations/`，采用时间戳前缀排序。
- 不提供向后兼容层， schema 变更为强制升级路径。

## 数据保留策略（MVP-0）
- 审计日志：默认保留 365 天（可配置）。
- 审计导出：默认保留 30 天（可配置）。
- 凭据密文：随账号生命周期保留，账号关闭后按策略清理。
- 日志与导出均需脱敏与访问审计。
