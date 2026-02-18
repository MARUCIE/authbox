---
Title: PRD - initiative_10_auth_box
Scope: project
Owner: ai-agent
Status: active
LastUpdated: 2026-02-18
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
| P0_DISCOVERY_USER | 搜索进入的潜在客户 | Journey P0 + Journey P1 |
| P1_PLATFORM_ADMIN | 平台管理员 | Journey A + Journey B |
| P2_SECURITY_OPS | 业务接入工程师（安全运维） | Journey C + Journey D |
| P3_COMPLIANCE_AUDITOR | 合规审计人员 | Journey E |
| P4_POLICY_ADMIN | 平台管理员（策略配置） | Journey F |

## 竞品分析与定位（多角色脑暴，2026-02-11）

| 竞品类别 | 代表产品（类别） | 对方优势 | Auth Box 差异化定位 |
|---|---|---|---|
| Secrets 管理 | Vault / Doppler / Infisical | 密钥管理成熟，生态广 | 增加“账号-授权-AI 助手-审计”业务闭环 |
| API 网关治理 | Kong / Apigee | 策略与流量治理强 | 聚焦授权生命周期与合规审计链 |
| AI 访问层 | LLM Gateway 类 | 模型调用可观测与路由能力强 | 增加企业级授权主数据与权限边界治理 |
| IAM/SSO | Okta/Auth0 类 | 身份与组织权限模型成熟 | 不做通用 IAM，专注 API 授权治理细分场景 |

- 产品定位结论：Auth Box 定位为 **API 授权治理中台（AI 场景优先）**，而非通用 IAM/网关替代。

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
- 统一 AuthN/AuthZ 入口：`/api/v1/*` 强制 Bearer Token，按角色执行 RBAC 门禁
- 鉴权配置入口强校验：`AUTH_BOX_AUTH_TOKENS` 启用 role 白名单并在启动阶段 fail-fast
- 调用方来源对齐：Console 默认发送 `X-Auth-Source` 并透传到 `audit.source`
- 审计链路增强：事件补齐 `actor_id/source/decision`，并记录 `event_hash/prev_event_hash`
- 平台/账号审计事件补齐：`PLATFORM_CREATED/UPDATED/DELETED`、`ACCOUNT_PROVISIONED`、`ACCOUNT_STATUS_CHANGED`
- Persona 真实流程脚本升级：增加真实前置条件（platform/account/credential/export id）
- strict 口径下多 persona 客户旅程通过率提升到 100%

## 本次交付范围（MVP-2 增量：增长入口）
- 已落地：Public sitemap 与 SEO URL 规范（Landing / Features / Use Cases / Compare / Docs / Blog / Changelog / Contact）。
- 已落地：Compare 页面模板（3 个）：Vault/Doppler/Kong 替代对比。
- 已落地：`/sitemap.xml` 与 `/robots.txt` 元数据端点。
- 已落地（最小版）：SEO 转化漏斗埋点（`PUBLIC_PAGE_VIEW` / `PUBLIC_CTA_CLICK` / `ONBOARDING_ENTRY_VIEW`）。
- 已落地（最小版）：双漏斗指标接口（`GET /api/telemetry/public-funnel`）。
- 已落地（最小版）：漏斗看板页面（`/metrics/funnel`）。
- 已落地（最小版）：文件持久化（`AUTH_BOX_CONSOLE_TELEMETRY_FILE`，重启后指标保持）。
- 已落地（最小版）：过滤与趋势（`window_minutes/source/persona/route/bucket_minutes`）。
- 已落地（最小版）：租户维度聚合与过滤（`tenant_id` + `top_tenants`）。
- 已落地（最小版）：阈值告警（`alerts` + `AUTH_BOX_FUNNEL_MIN_*`）。
- 待补齐：历史趋势图与告警订阅通道（邮件/Webhook）。

## 真实流程测试结论（2026-02-11）
| 模式 | 预期口径 | 总步骤 | 成功 | 失败 | 成功率 |
|---|---|---:|---:|---:|---:|
| strict-baseline | 升级前（Journey C/D/E 未实现） | 18 | 11 | 7 | 61.11% |
| strict-postfix | 升级后（Journey C/D/E 已实现） | 20 | 20 | 0 | 100.00% |
| mvp0-postfix | 与 strict 同口径复测 | 20 | 20 | 0 | 100.00% |

- strict-baseline 失败根因：Journey C/D/E 当时仍为占位端点，返回 `NOT_IMPLEMENTED`。
- 修复策略：实现 C/D/E 对应 API，并将 persona 脚本改为真实前置条件链路。

## 真实 API 验收约束（2026-02-11）
- 最终验收必须通过真实 API（非生产环境）端到端流程。
- 不得以 mock/fake response 替代最终验收。
- 必须沉淀可复现 fixtures，并可执行 replay/regression 回放。
- 基线清单：`services/api/testdata/fixtures/real_api_core_flow/manifest.json`
- 闭环守门脚本：`scripts/full_loop_closure_check.sh`（entry/system/contract/verification）

## 非功能需求
- 安全：最小权限、密钥加密存储、统一 AuthN/AuthZ、审计不可篡改（hash chain）。
- 合规：操作留痕、敏感数据脱敏、可导出审计报告。
- 可靠性：关键流程可回滚，失败具可解释错误码。
- 可维护性：单一事实源文档、可追踪需求变更、真实 API fixtures 可回放。
- 增长：支持 sitemap/robots 与关键词落地页，确保可抓取与转化可观测。

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

## 一键全量交付验收（2026-02-12，已完成）
- SOP：one-click-full-delivery
- Run：`outputs/one-click-full-delivery/20260212T022828Z`
- 验收范围：
  - Round 1：`ai check`
  - Round 2：按 UX Map 进行人工模拟测试
  - 前端专项：network/console/performance/visual baseline
  - 后端专项：API 契约/错误码/入口一致性
- 验收结果：
  - Round 1 PASS：`outputs/one-click-full-delivery/20260212T022828Z/logs/ai_check_round1.log`
  - Round 2 PASS：`outputs/one-click-full-delivery/20260212T022828Z/reports/uxmap_round2/uxmap_round2_assertion.txt`
  - 前端专项 PASS：`outputs/one-click-full-delivery/20260212T022828Z/reports/frontend_audit/frontend_audit_assertion.txt`
  - 后端专项 PASS：`outputs/one-click-full-delivery/20260212T022828Z/reports/backend_contract_entry_assertion.txt`
- 约束：最终验收不得以 mock 替代真实 API 结果。

## SOP 4.1 回归记录（2026-02-12）
- Run：`outputs/project-regression/20260212T030804Z`
- 目标：项目级全链路回归（UX Map + E2E）验证现网开发基线可用性。
- 结果：
  - 入口闭环 PASS：`outputs/project-regression/20260212T030804Z/reports/full_loop_3_7_assertion.txt`
  - UX Map Round 2 PASS：`outputs/project-regression/20260212T030804Z/reports/uxmap_round2/uxmap_round2_assertion.txt`
  - `ai check` PASS：`outputs/project-regression/20260212T030804Z/logs/ai_check_round1.log`（见 Step 6）
- 结论：本轮为回归验收，不新增产品需求边界。

## 一键全量交付复核（2026-02-12，Run 20260212T032220Z）
- 触发：用户再次执行 SOP 1.1（长任务）进行同口径复核。
- 范围：不新增需求边界，沿用既有验收标准（Round 1 ai check + Round 2 UX Map + 前后端专项 + Task Closeout）。
- 当前证据（Step 4）：`outputs/one-click-full-delivery/20260212T032220Z/reports/uxmap_round2/uxmap_round2_assertion.txt`（PASS）。
- 验收结果（Step 6/7）：`ai check` PASS、frontend audit PASS、backend full-loop PASS（见 `outputs/one-click-full-delivery/20260212T032220Z/reports/one_click_full_delivery_report.md`）。
- 结论：本轮为验收复跑，产品范围与非目标保持不变。

## SOP 4.1 回归记录（2026-02-12，Run 20260212T034924Z）
- Run：`outputs/project-regression/20260212T034924Z`
- 目标：项目级全链路回归（UX Map + E2E）验证当前基线可用性。
- 执行结果：
  - Step 3 UX Map 回归 PASS：`outputs/project-regression/20260212T034924Z/reports/uxmap_round2/uxmap_round2_assertion.txt`
  - Step 4 同类问题扫描 PASS：`outputs/project-regression/20260212T034924Z/reports/similar_issue_scan/similar_issue_scan_assertion.txt`
  - 问题修复：telemetry payload 字段从 `event_type` 修正为 `event`（避免 `INVALID_EVENT`）。
- 结论：本轮为回归验收，不新增需求边界。

## SOP 4.1 回归记录（2026-02-13，Run 20260213T021241Z）
- Run：`outputs/project-regression/20260213T021241Z`
- 目标：项目级全链路回归（UX Map + E2E）验证当前基线可用性。
- 执行结果：
  - Step 3 UX Map 回归 PASS：`outputs/project-regression/20260213T021241Z/reports/uxmap_round2/uxmap_round2_assertion.txt`
  - Step 4 同类问题扫描 PASS：`outputs/project-regression/20260213T021241Z/reports/similar_issue_scan/similar_issue_scan_assertion.txt`
  - E2E（real API replay + contract loop）PASS：`outputs/project-regression/20260213T021241Z/reports/full_loop_replay/reports/full_loop_summary.json`
  - Step 6 Round 1 `ai check` PASS：`outputs/project-regression/20260213T021241Z/logs/ai_check_round1.log`
- 结论：本轮为回归验收复跑，不新增产品需求边界。

## SOP：前端 UI/UX 优化（2026-02-18）
- Run：`outputs/frontend-ui-ux-optimization/20260218T042527Z`
- 需求边界：
  - 修复首页信息层级与间距节奏（Hero 主叙事 -> Activation path -> 能力列表）。
  - 保持单一主按钮（Primary CTA 仅保留 `Start onboarding`）。
  - 次级动作统一为文本链接样式，降低视觉竞争。
- 实现落点：
  - `apps/console/app/page.tsx`
  - `apps/console/app/globals.css`
  - `apps/console/components/marketing-page.tsx`
- 验收结果：
  - network/console/performance：PASS（post）
  - visual regression：命中预期变更路由并通过断言（`visual_regression_assertion.txt`）
  - `ai check --no-sbom`：PASS（`outputs/frontend-ui-ux-optimization/20260218T042527Z/logs/ai_check.log`）

## SOP：世界 SOTA 产品/平台发布流程基准调研（2026-02-18）
- 调研窗口：2025-02-18 ~ 2026-02-18（UTC）。
- 样本：OpenAI / Anthropic / Google DeepMind / Microsoft / GitHub / GitLab / Vercel。
- 证据：`outputs/sota-product-sop-research/20260218T064240Z/reports/`。

### 新增产品需求（SOP 治理能力）
1. 发布风险分级（P0/P1/P2）
- P0：auth/session/secret/permission/data export 变更，必须双层门禁 + 人工签署。
- P1：关键路径功能（核心 UI/API），必须自动门禁 + 抽样人工复核。
- P2：低风险改动，走标准 CI + smoke。

2. 双层发布门禁
- Layer A（Pipeline Gate）：lint/type/test/build/security scan 全绿。
- Layer B（Release Gate）：风险清单、回归清单、证据包完整性、签署记录。

3. 发布后观察窗口
- 固定 24h/72h 观察窗口；触发阈值时自动进入回滚/冻结/补测路径。

4. 指标化治理（最小集）
- gate_pass_rate
- regression_escape_rate
- time_to_detect / time_to_recover
- error_budget_burn_rate
- evidence_completeness_rate

### 验收标准（新增）
- 所有发布 run 必须生成 `outputs/<sop-id>/<run-id>/` 完整证据树。
- P0 发布必须具备 gatekeeper 签署记录与 post-release 观察报告。
- 指标阈值触发后，必须自动创建 postmortem 条目并回写问题库。

### 备注（推断边界）
- 本节为对 SOTA 样本流程的可迁移抽象，不是对任一厂商 SOP 的直接复制。

### 状态更新（2026-02-18）
- “发布风险分级 + 双层门禁”已进入可执行状态：
  - 本地命令：`make risk-classify`、`make release-gate`
  - CI 工作流：`.github/workflows/release-gate.yml`
