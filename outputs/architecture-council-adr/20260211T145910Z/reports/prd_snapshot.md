---
Title: PRD - initiative_10_auth_box
Scope: project
Owner: ai-agent
Status: active
LastUpdated: 2026-02-11
Related:
  - /doc/index.md
  - /doc/00_project/index.md
  - /doc/00_project/initiative_10_auth_box/index.md
  - /doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md
  - /doc/00_project/initiative_10_auth_box/USER_EXPERIENCE_MAP.md
  - /doc/00_project/initiative_10_auth_box/PLATFORM_OPTIMIZATION_PLAN.md
---

# PRD - 接口授权管理平台

## 背景与问题
- 多平台账号与 API 授权分散管理，导致接入成本高、权限不可审计、易失控。
- 需要一套统一平台，自动创建多平台账号并集中治理授权、密钥轮换与 AI 助手接入。

## 目标
- 建立统一的 API 授权管理平台，覆盖多平台账号自动创建、授权生命周期管理与 AI 助手接入。
- 提供可审计的权限管理、密钥管理与接入追踪。
- 形成 SOP 化的一键交付流程，支持长任务证据留存。

## 非目标
- 不做第三方平台自有权限系统的全量替换。
- 不提供通用 IAM（只聚焦 API 授权与 AI 助手接入）。
- 不做过渡兼容层（新格式为唯一事实源）。

## 关键用户与场景
- 平台管理员：配置平台连接与全局策略。
- 业务接入工程师：创建账号、申请/绑定授权、调用接入。
- 合规审计人员：查看权限、密钥与访问记录。

## Persona 验收对象（2026-02-11）
| Persona | 用户类型 | 目标旅程 |
|---|---|---|
| P1_PLATFORM_ADMIN | 平台管理员 | Journey A + Journey B |
| P2_SECURITY_OPS | 业务接入工程师（安全运维） | Journey C + Journey D |
| P3_COMPLIANCE_AUDITOR | 合规审计人员 | Journey E |
| P4_POLICY_ADMIN | 平台管理员（策略配置） | Journey F |

## 核心概念模型（来自调研 ai_master_control_prd.html）

MVP 采用 7 个核心对象：

| 对象 | 说明 | 关键字段 |
|------|------|----------|
| Service | 外部平台/应用（Google/Microsoft/GitHub 等） | provider_id, api_capabilities, auth_type |
| Account | 用户在某服务上的身份 | account_id, identifiers, risk_score |
| Grant | OAuth/其他机制授予的访问权 | scopes, issued_at, expires_at, refreshable |
| Consent Record | 用户"同意/拒绝/撤回/目的限制"的机器可读记录 | purpose, lawful_basis, timestamp, receipt |
| Policy | 机器可执行的授权/数据/动作规则 | rules, exceptions, enforcement_level |
| Automation | 可执行工作流 | trigger, steps, approvals, rollback |
| Audit Event | 所有读取/写入/删除/授权变更的不可抵赖记录 | who/what/when/why, cryptographic chain |

## 接管程度刻度

| 模式 | 执行特征 | 适用场景 | 风险控制 |
|------|----------|----------|----------|
| 手动 | AI 只做分析与建议，不执行动作 | 高敏感用户 | 零外部副作用 |
| 辅助（MVP 默认） | AI 生成方案，用户点一次确认后批量执行 | 标准接入 | 审批门槛 + 回滚 |
| 自动 | 低风险动作自动执行；高风险仍需确认 | 稳定期用户 | 策略分级 + 速率限制 |
| 托管 | 接近"代管"：需要更强身份验证与合规约束 | 遗产/监护场景 | 双重验证 + 法律证明 |

## AI 驱动设计原则

1. **工具白名单**：模型只能调用明确的工具；每个工具只做一件事。
2. **策略前置**：任何工具调用先走策略引擎（OPA）判定 allow/deny。
3. **输出类型化**：模型输出必须是结构化 JSON/DSL，经 schema 校验。
4. **双通道解释**：给用户同时展示"将要做什么"和"为什么需要这个权限"。
5. **回放与撤销**：工作流每一步都可回滚，至少对"外部副作用"提供补偿动作。

## 功能需求（MVP）
1. 多平台账号自动创建与登记。
2. 授权凭据（API Key/OAuth Token）生命周期管理（创建/轮换/吊销）。
3. AI 助手接入管理（绑定账号/密钥、权限范围、调用记录）。
4. 统一权限与角色模型（管理员/接入者/审计）。
5. 可审计日志（操作/授权/调用记录）。
6. SOP 一键交付流程与证据留存。
7. 错误码与审计事件字典（MVP）定义与对外一致性。
8. 接管程度配置（默认辅助模式）。
9. 策略引擎（OPA）集成（MVP-1）。

## 本次交付范围（MVP-0）
- Go API 服务骨架（/health 与基础路由框架）。
- Next.js 控制台骨架与关键页面占位。
- Docker Compose 最小链路（API + Console + PostgreSQL + Redis）。
- 配置与运行手册占位，确保可启动与可演进。

## 本次交付范围（MVP-1 增量）
- 授权凭据 API：`/api/v1/credentials`（create/list/rotate/delete）
- AI 助手 API：`/api/v1/assistants`（create/list/get/bind）
- 审计 API：`/api/v1/audit`（list/export/create export/get export）
- Persona 真实流程脚本升级：增加真实前置条件（platform/account/credential/export id）
- strict 口径下多 persona 客户旅程通过率提升到 100%

## 真实流程测试结论（2026-02-11）
| 模式 | 预期口径 | 总步骤 | 成功 | 失败 | 成功率 |
|---|---|---:|---:|---:|---:|
| strict-baseline | 升级前（Journey C/D/E 未实现） | 18 | 11 | 7 | 61.11% |
| strict-postfix | 升级后（Journey C/D/E 已实现） | 20 | 20 | 0 | 100.00% |
| mvp0-postfix | 与 strict 同口径复测 | 20 | 20 | 0 | 100.00% |

- strict-baseline 失败根因：Journey C/D/E 当时仍为占位端点，返回 `NOT_IMPLEMENTED`。
- 修复策略：实现 C/D/E 对应 API，并将 persona 脚本改为真实前置条件链路。

## 非功能需求
- 安全：最小权限、密钥加密存储、审计不可篡改。
- 合规：操作留痕、敏感数据脱敏、可导出审计报告。
- 可靠性：关键流程可回滚，失败具可解释错误码。
- 可维护性：单一事实源文档与可追踪需求变更。

## 技术栈与部署
- 后端：Go（REST + OpenAPI 3.1），路由与中间件轻量化。
- 前端：Next.js（控制台），统一控制台入口与管理体验。
- 数据库：PostgreSQL（凭据、账号、审计主存储）。
- 缓存/队列：Redis（短期缓存、异步任务调度）。
- 密钥管理：信封加密（主密钥来自 KMS；本地开发使用环境变量占位）。
- 审计归档：对象存储（S3 兼容）保存导出与归档。
- 可观测性：OpenTelemetry 统一追踪；日志结构化输出。
- 部署：Docker Compose 本地最小可运行链路；后续可容器化部署。

## 数据与合规
- API Key 默认存储优先级：数据库 > 环境变量。
- 禁止明文写入代码与文档，示例使用占位符。
- 审计日志默认保留 365 天，审计导出默认保留 30 天（可配置）。

## 里程碑（建议）
- M0: 可运行骨架完成（API + Console + DB + Compose）。
- M1: 项目文档与架构基线完成。
- M2: MVP 核心流程可用（账号创建 + 授权管理 + AI 接入）。
- M3: 审计与 SOP 交付闭环完成。
