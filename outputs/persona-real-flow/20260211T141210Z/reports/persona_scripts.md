# Persona Scripts (Council Mode)

## Persona P1: 平台管理员（Platform Admin）
- UX Map 对齐：Journey A + Journey B
- Entry: `/platforms/new`
- Tasks:
  1. 创建平台连接（POST `/api/v1/platforms`）
  2. 查询并更新平台（GET/PATCH `/api/v1/platforms/{id}`）
  3. 创建与更新账号（POST/PATCH `/api/v1/accounts/{id}`）
- Expected Result:
  - strict/mvp0：全部 2xx

## Persona P2: 安全运维（Security Ops）
- UX Map 对齐：Journey C + Journey D
- Entry: `/credentials`、`/assistants`
- Tasks:
  1. 前置创建平台与账号（POST `/api/v1/platforms`, POST `/api/v1/accounts`）
  2. 创建凭据并轮换（POST `/api/v1/credentials`, POST `/api/v1/credentials/{id}/rotate`）
  3. 创建助手并绑定凭据（POST `/api/v1/assistants`, POST `/api/v1/assistants/{id}/bind`）
- Expected Result:
  - strict/mvp0：全部 2xx

## Persona P3: 合规审计（Compliance Auditor）
- UX Map 对齐：Journey E
- Entry: `/audit`
- Tasks:
  1. 查询审计日志（GET `/api/v1/audit`）
  2. 请求导出（POST `/api/v1/audit/exports`）
  3. 用真实 export_id 查询导出结果（GET `/api/v1/audit/exports/{id}`）
- Expected Result:
  - strict/mvp0：全部 2xx

## Persona P4: 策略管理员（Policy Admin）
- UX Map 对齐：Journey F
- Entry: `/settings`
- Tasks:
  1. 访问设置页并验证可达性
- Expected Result:
  - strict/mvp0：页面 200
