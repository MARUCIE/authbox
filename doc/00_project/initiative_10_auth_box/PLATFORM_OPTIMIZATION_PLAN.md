---
Title: PLATFORM_OPTIMIZATION_PLAN - initiative_10_auth_box
Scope: project
Owner: ai-agent
Status: active
LastUpdated: 2026-05-31
Related:
  - /doc/index.md
  - /doc/00_project/index.md
  - /doc/00_project/initiative_10_auth_box/index.md
  - /doc/00_project/initiative_10_auth_box/PRD.md
  - /doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md
  - /doc/00_project/initiative_10_auth_box/USER_EXPERIENCE_MAP.md
---

# 平台优化计划

## 目标
- 稳定性优先：授权与审计链路不可中断。
- 安全性优先：密钥加密与最小权限。
- 交付效率：SOP 一键交付与证据留存。

## 技术栈约束与优化落点
- PostgreSQL：索引与分区策略优先保证审计查询可用性。
- Redis：控制高频读取缓存与异步任务调度。
- OpenTelemetry：统一追踪链路，避免盲区。
- 对象存储：审计导出与归档分层存储，控制成本。
- Docker Compose：本地最小链路可启动，缩短验证回路。
 - 数据保留：审计与导出按策略分层保留，控制存储与合规成本。

## 重点优化方向
1. 安全与合规：密钥轮换策略、审计防篡改。
2. 可靠性：关键流程幂等与失败重试策略。
3. 可观测性：审计日志与调用链追踪。
4. 成本控制：外部平台调用与存储成本优化。
5. 体验：配置与接入流程降低认知负担。

## 执行进展（2026-02-11）

| 项目 | 结果 | 证据 |
|---|---|---|
| 统一 AuthN/AuthZ 入口 | 已落地：`/api/v1/*` 强制 Bearer + RBAC | `outputs/security-entry-audit-chain/20260211T150834Z/logs/runtime_security_flow_retry2.log` |
| 高风险动作门禁 | 已落地：rotate/revoke、assistant bind、audit export 角色校验 | `outputs/security-entry-audit-chain/20260211T150834Z/reports/rotate_forbidden.json` |
| 审计 hash-chain | 已落地：`actor_id/source/decision/event_hash/prev_event_hash` | `outputs/security-entry-audit-chain/20260211T150834Z/reports/audit_events.json` |
| API 契约与鉴权同步 | 已落地：role 白名单 fail-fast + source 透传 + 平台/账号审计事件补齐 | `outputs/api-contract-auth-sync/20260211T154715Z/reports/api_contract_auth_sync_report.md` |
| 多角色脑暴（PM/设计/SEO） | 已落地：竞品分析 + UX 增量旅程 + sitemap/关键词策略 | `outputs/multi-role-brainstorm/20260211T160722Z/reports/brainstorm_summary.md` |
| Public SEO 路由与入口 | 已落地：`/product`、`/features/*`、`/use-cases/*`、`/compare/*`、`/docs`、`/pricing`、`/security`、`/blog`、`/changelog`、`/contact` + `sitemap/robots` | `outputs/multi-role-brainstorm/20260211T160722Z/logs/console_build_public_routes.log` |
| 双漏斗埋点与聚合 | 已落地（最小版）：public-events 采集 + public-funnel 聚合 | `outputs/multi-role-brainstorm/20260211T160722Z/reports/public_funnel_after.json` |
| 双漏斗持久化与看板 | 已落地（最小版）：`AUTH_BOX_CONSOLE_TELEMETRY_FILE` + `/metrics/funnel` | `outputs/multi-role-brainstorm/20260211T160722Z/reports/persistence/persistence_assertion.txt` |
| 双漏斗过滤与趋势 | 已落地（最小版）：按 `window/source/persona/route` 过滤 + bucket 趋势 | `outputs/multi-role-brainstorm/20260211T160722Z/reports/filter_trend/filter_trend_assertion.txt` |
| 双漏斗分租户与阈值告警 | 已落地（最小版）：`tenant_id` 过滤/聚合 + `alerts` 阈值告警 | `outputs/multi-role-brainstorm/20260211T160722Z/reports/tenant_alert/tenant_alert_assertion.txt` |
| 真实 API fixtures | 已落地：capture + replay + regression 证据链 | `outputs/real-api-fixtures-replay/20260211T152326Z/` |
| 功能闭环守门 | 已落地：entry/system/contract/verification 一键检查 | `scripts/full_loop_closure_check.sh` |

## 成功指标
- 授权创建成功率 >= 99%
- 审计日志可追溯率 = 100%
- 关键流程平均响应 < 500ms（初期）
- SEO 入口到 Console CTA CTR >= 3%（初期）
- Organic 流量中高意图关键词占比逐月提升

## Native iOS Baseline Closeout (2026-05-31)

| Area | Result | Evidence |
|---|---|---|
| Generated artifact hygiene | `*.tsbuildinfo`, SwiftPM `.build`, Xcode `build`, runtime output dirs ignored; tracked `tsconfig.tsbuildinfo` files removed from Git index | `.gitignore`, `git rm --cached apps/web/tsconfig.tsbuildinfo packages/*/tsconfig.tsbuildinfo` |
| Swift crypto parity | Swift package mirrors TypeScript seed/HKDF/AES/SRP vectors | `swift test` in `apps/ios/AuthBoxCrypto` -> 62/62 PASS |
| TypeScript vector source | Root script added for repeatable vector generation | `pnpm run ios:crypto-vectors` PASS |
| iOS app build | SwiftUI app + AutoFill extension compile for simulator | `xcodebuildmcp build_sim` PASS, zero warnings/errors |
| iOS UX smoke | Full onboarding and vault UI test executes in simulator | `xcodebuildmcp test_sim` -> 1/1 PASS, zero warnings/errors |
| Release boundary | No push, deploy, VPS action, or production credential use | Local-only work package closeout |

## 增长与 SEO 优化（新增）
1. URL 分层治理：`features/use-cases/compare/docs` 四层信息架构。
2. 关键词簇治理：授权治理、安全运维、合规审计、AI 权限治理、竞品替代。
3. 转化链路治理：Landing -> `/platforms/new` -> Journey A/B。
4. 内容节奏治理：每月案例/合规更新/changelog，统一回写 sitemap。

## 连接器开发规范（来自调研 ai_master_control_prd.html）

| 规范 | 说明 | 验收标准 |
|------|------|----------|
| 声明式能力矩阵 | 每个连接器提供 machine-readable 的 capabilities | JSON schema 可解析 |
| 最小 Scope | 只申请必须的 scopes | 无多余权限 |
| 增量同步 | 必须支持 cursor/watermark | 避免全量拉取 |
| 幂等与补偿 | 写/删动作必须幂等；提供补偿动作 | 可回滚 |
| 速率限制 | 按平台政策做自适应限流 | 无封禁 |
| 输出规范 | 统一为内部 Canonical Schema | 通过 schema 校验 |

## 安全基线（来自调研 ai_master_control_prd.html）

| 安全项 | 说明 | MVP 状态 |
|--------|------|----------|
| 端到端加密 | Vault 数据在端侧加密，云端只存密文 | MVP-1 |
| 强身份验证 | 优先 Passkeys/WebAuthn | MVP-1 |
| Token 安全 | 支持 DPoP/绑定型令牌 | MVP-2 |
| 最小权限连接器 | 每个连接器声明能力矩阵 | MVP-0 |
| 隔离与最小爆炸半径 | 每个租户独立密钥域 | MVP-1 |

## 审计事件溯源（Event Sourcing）

```
AuditEvent {
  event_id, timestamp, actor (user/agent/service), action,
  resource_ref (asset/grant/policy), decision (allow/deny/step_up),
  inputs_hash, outputs_hash, reason, signature, prev_event_hash
}
```

- 用哈希链把事件串起来，避免"日志被改了你还不知道"
- 每个事件包含 prev_event_hash，形成不可篡改链
- 支持导出与验证

## 一键全量交付验收计划（2026-02-12，已完成）
- SOP 证据目录：`outputs/one-click-full-delivery/20260212T022828Z`
- 本轮优化与守门动作：
  1. 执行 Round 1 `ai check` 作为自动化门禁
  2. 执行 Round 2 UX Map 人工模拟并留证据
  3. 前端专项检查：network/console/performance/visual baseline
  4. 后端专项检查：API 契约/错误码/入口一致性
  5. Task Closeout：deliverable + rolling ledger + 三端一致性声明
- 检查结果：
  - Round 1 PASS：`outputs/one-click-full-delivery/20260212T022828Z/logs/ai_check_round1.log`
  - Frontend 专项 PASS：`outputs/one-click-full-delivery/20260212T022828Z/reports/frontend_audit/frontend_audit_assertion.txt`
  - Backend 专项 PASS：`outputs/one-click-full-delivery/20260212T022828Z/reports/backend_contract_entry_assertion.txt`

## SOP 4.1 回归记录（2026-02-12）
- Run：`outputs/project-regression/20260212T030804Z`
- 回归守门执行：
  - Step 3 UX Map 回归：PASS（`outputs/project-regression/20260212T030804Z/reports/uxmap_round2/uxmap_round2_assertion.txt`）
  - Step 4 同类问题扫描：PASS（fallback）（`outputs/project-regression/20260212T030804Z/reports/similar_issue_scan/similar_issue_scan_assertion.txt`）
  - Step 6 `ai check` Round 1：PASS（`outputs/project-regression/20260212T030804Z/logs/ai_check_round1.log`）
- 优化结论：本轮未新增性能/可靠性缺陷，维持现有阈值与门禁策略。

## 一键全量交付复核记录（2026-02-12，Run 20260212T032220Z）
- 目的：在当前代码基线上复跑 long-task 验收门禁，确认无新增回归。
- 已完成：Step 4（UX Map Round 2）PASS。
- 证据：`outputs/one-click-full-delivery/20260212T032220Z/reports/uxmap_round2/uxmap_round2_assertion.txt`、`outputs/one-click-full-delivery/20260212T032220Z/reports/similar_issue_scan/similar_issue_scan_assertion.txt`。
- 守门结果：Round 1 `ai check` PASS；frontend audit PASS；backend full-loop PASS。
- 优化结论：保持既有性能/可靠性阈值，不调整优化优先级。

## SOP 4.1 回归守门记录（2026-02-12，Run 20260212T034924Z）
- 回归目标：执行项目级全链路回归并复核 UX Map + E2E 门禁。
- 回归结果：
  - Round 2 UX Map PASS：`outputs/project-regression/20260212T034924Z/reports/uxmap_round2/uxmap_round2_assertion.txt`
  - 同类问题扫描 PASS：`outputs/project-regression/20260212T034924Z/reports/similar_issue_scan/similar_issue_scan_assertion.txt`
  - full-loop summary PASS：`outputs/project-regression/20260212T034924Z/reports/full_loop_closure/reports/full_loop_summary.json`
- 修复沉淀：telemetry 请求字段统一为 `event`（与 API 契约一致），避免回归期 `INVALID_EVENT`。
- 优化结论：维持现有性能/可靠性阈值，当前不调整优先级。

## SOP 4.1 回归守门记录（2026-02-13，Run 20260213T021241Z）
- 回归目标：复核 UX Map + E2E 门禁在当前基线仍通过。
- 回归结果：
  - Round 2 UX Map PASS：`outputs/project-regression/20260213T021241Z/reports/uxmap_round2/uxmap_round2_assertion.txt`
  - 同类问题扫描 PASS：`outputs/project-regression/20260213T021241Z/reports/similar_issue_scan/similar_issue_scan_assertion.txt`
  - E2E（real API + contract）PASS：`outputs/project-regression/20260213T021241Z/reports/full_loop_replay/reports/full_loop_summary.json`
  - Round 1 `ai check` PASS：`outputs/project-regression/20260213T021241Z/logs/ai_check_round1.log`
- 优化结论：维持现有阈值与门禁策略。

## SOP 6.2 性能与成本预算记录（2026-02-13，Run 20260213T050159Z）
- Run：`outputs/performance-budget/20260213T050159Z`
- 预算：
  - first_load_js_shared_kb_max=100.0
  - endpoint_p95_s_max=0.2
- 基线：
  - first_load_js_shared_kb=87.1
  - telemetry_post：202:20（见 report）
- 证据：
  - 汇总：`outputs/performance-budget/20260213T050159Z/reports/sop62_summary.md`
  - Step 2：`outputs/performance-budget/20260213T050159Z/reports/sop62_step2_assertion.txt`
  - 报告：`outputs/performance-budget/20260213T050159Z/reports/benchmarks/benchmark_report.md`
  - 数据：`outputs/performance-budget/20260213T050159Z/reports/benchmarks/benchmark_summary.json`
- 结论：PASS；未触发 Step 3 优化复测

## SOP 优化专项：世界 SOTA 产品 SOP 基准迁移（2026-02-18）
- Run：`outputs/sota-product-sop-research/20260218T064240Z`
- 输入报告：
  - `outputs/sota-product-sop-research/20260218T064240Z/reports/source_inventory.md`
  - `outputs/sota-product-sop-research/20260218T064240Z/reports/sop_benchmark_matrix.md`
  - `outputs/sota-product-sop-research/20260218T064240Z/reports/transferability_and_risks.md`

### 优化目标
1. 将当前发布流程升级为“风险分级驱动 + 双层门禁 + 观察窗口 + 指标阈值触发”闭环。
2. 降低高风险变更回归泄漏率，并提升发布可审计性。

### 实施阶段
1. Phase A（治理定义）
- 固化 P0/P1/P2 风险分类规则。
- 固化 Layer A / Layer B 发布门禁检查项。

2. Phase B（流程接入）
- 将证据完整性校验接入发布前检查。
- 引入 gatekeeper 签署记录。

3. Phase C（观测与复盘）
- 接入 24h/72h 观察窗口报告模板。
- 阈值命中自动触发 postmortem。

### KPI 与阈值（建议）
- gate_pass_rate >= 95%
- evidence_completeness_rate = 100%（P0 必须）
- regression_escape_rate <= 2%（按月）
- time_to_detect <= 30m（P0/P1）

### 风险与缓解
- 风险：门禁过严影响吞吐。
- 缓解：按风险分级施加门禁，不一刀切。
- 风险：指标形式化。
- 缓解：每个指标绑定触发动作（回滚/冻结/补测）。

## 实施进展（2026-02-18）- 发布门禁自动化已落地
- 已实现：风险分级（P0/P1/P2）与双层门禁（Layer A/Layer B）脚本化执行。
- 实现文件：
  - `scripts/release_risk_classify.sh`
  - `scripts/release_gate.sh`
  - `.github/workflows/release-gate.yml`
- 验证证据：
  - `outputs/release-gate/20260218T112018Z/reports/release_gate_summary.json`（PASS）
  - `outputs/release-gate/20260218T112018Z-p1-sample/reports/release_gate_summary.json`（FAIL，security gate）

## SOP 优化专项：专业智能体设计（2026-02-18）
- Run：`outputs/professional-agent-design/20260218T112653Z`
- 设计输入：
  - `outputs/professional-agent-design/20260218T112653Z/reports/tooling_inventory_summary.txt`
  - `outputs/professional-agent-design/20260218T112653Z/reports/tooling_inventory_detail.md`
- 设计产物：
  - `configs/agent-router/professional-agent-routing.v1.json`
  - `doc/00_project/initiative_10_auth_box/AGENT_PROFESSIONAL_DESIGN.md`

### 优化目标
1. 建立项目级专业智能体 persona 与职责边界，降低执行漂移。
2. 固化 trigger/router 规则，提升任务路由一致性与可追溯性。
3. 将 Round1/Round2 验收纳入智能体 SOP 默认门禁。

### 验证结果
- Round 1 `ai check --no-sbom`：PASS（`outputs/professional-agent-design/20260218T112653Z/logs/ai_check_round1.log`）
- Round 2 设计一致性断言：PASS（`outputs/professional-agent-design/20260218T112653Z/reports/round2_design_consistency_assertion.txt`）

---

## Auth Box v2 Hardening Round (2026-02-24)

### Optimization Batch 1: Security + Infrastructure (DONE)

| # | Category | Severity | Fix | File |
|---|----------|----------|-----|------|
| 1 | Security | CRITICAL | CSP `connect-src 'self'` added | `middleware/security.go` |
| 2 | Security | HIGH | X-Forwarded-For: take only leftmost IP via centralized `ClientIP()` | `middleware/security.go`, `ratelimit.go`, `auth_handler.go` |
| 3 | Security | MEDIUM | Request body size limit (1MB) middleware | `middleware/security.go`, `cmd/api/main.go` |
| 4 | Security | MEDIUM | String length validation on registration fields | `handler/auth_handler.go` |
| 5 | API | HIGH | HTTP server full timeout suite (Read/Write/Idle/MaxHeaderBytes) | `cmd/api/main.go` |
| 6 | API | MEDIUM | DB connection pool config (max=20, min=2, idle=5m, lifetime=30m) | `cmd/api/main.go` |
| 7 | API | HIGH | Vault SyncPull pagination (limit param, max 1000) | `vault_repo.go`, `vault_service.go`, `vault_handler.go` |
| 8 | API | MEDIUM | Vault ListItems pagination (limit/offset, max 500) | same as #7 |
| 9 | API | MEDIUM | Audit pagination bounds clamp (limit 1-200, offset >= 0) | `handler/audit_handler.go` |
| 10 | API | LOW | Audit handler writeError params fixed (message/code order) | `handler/audit_handler.go` |
| 11 | API | MEDIUM | ItemType enum validation (credential/note/card/identity/api_key) | `service/vault_service.go` |
| 12 | Infra | HIGH | Docker API health check (wget /health) | `docker-compose.yml` |
| 13 | Infra | MEDIUM | Docker restart policies (unless-stopped) | `docker-compose.yml` |
| 14 | Infra | MEDIUM | Docker memory limits (API=256M, Web=512M) | `docker-compose.yml` |
| 15 | Infra | MEDIUM | Web depends_on API health check | `docker-compose.yml` |

### Optimization Batch 2: Rate Limiting + CORS + Frontend (DONE)

| # | Category | Severity | Fix | File |
|---|----------|----------|-----|------|
| 16 | Security | HIGH | Protected route rate limiter (120 req/min) | `cmd/api/main.go` |
| 17 | Security | HIGH | CORS origin validation (reject wildcard, require http/https scheme) | `config/config.go` |
| 18 | Security | LOW | `poweredByHeader: false` in Next.js config | `next.config.ts` |
| 19 | Frontend | MEDIUM | loading.tsx skeletons for 5 vault pages | `(vault)/*/loading.tsx` |
| 20 | Frontend | LOW | Dialog code-splitting: SKIP (page JS < 10kB, marginal benefit) | N/A |
| 21 | Frontend | LOW | System fonts only: N/A (app uses CSS vars, no Google Fonts loaded) | N/A |

### Verification (Round 4)

- `go vet ./...`: PASS (zero warnings)
- `go build ./...`: PASS (zero errors)
- `npx turbo build`: PASS (6/6 packages, 12/12 pages, 0 errors)
- Build output confirms all loading.tsx files included (no build warnings)

---

## Round 5: Security Hardening + UX Polish (2026-02-24)

### Batch 1: CRITICAL + HIGH Security Fixes (DONE)

| # | Category | Severity | Fix | File |
|---|----------|----------|-----|------|
| 22 | Security | CRITICAL | ClientPublicA/ClientProofM1 decoded byte length validation (0 < len <= 1024) | `handler/auth_handler.go` |
| 23 | Security | HIGH | Logout handler: reject empty bearer token before hashing | `handler/auth_handler.go` |
| 24 | Security | HIGH | AgentType enum validation (claude/gpt/gemini/custom) | `handler/agent_handler.go` |
| 25 | Security | HIGH | PolicyType enum validation (canonical: item_scope/action_perm/rate_limit/time_window/step_up) | `handler/agent_handler.go` |
| 26 | Security | HIGH | Agent name length bound (max 128 chars) | `handler/agent_handler.go` |
| 27 | Security | HIGH | Connection provider length bound (max 64 chars) | `handler/connection_handler.go` |
| 28 | Code Quality | MEDIUM | Sentinel error pattern: domain/errors.go + errors.Is() in handlers | `domain/errors.go`, `pg/agent_repo.go`, `pg/connection_repo.go`, `handler/agent_handler.go`, `handler/connection_handler.go` |

### Batch 2: UX + Infrastructure (DONE)

| # | Category | Severity | Fix | File |
|---|----------|----------|-----|------|
| 29 | UX | MEDIUM | Global error boundary (app/error.tsx) with retry + home links | `apps/web/app/error.tsx` |
| 30 | UX | MEDIUM | SVG favicon (lock icon, indigo #6366f1) | `apps/web/public/favicon.svg`, `apps/web/app/layout.tsx` |
| 31 | UX | MEDIUM | Web app manifest (PWA-ready, theme color) | `apps/web/app/manifest.ts` |
| 32 | Infra | LOW | Remove unused Redis service from docker-compose (deferred to Phase 4) | `docker-compose.yml` |
| 33 | Infra | LOW | Docker web HEALTHCHECK (wget localhost:3000) | `apps/web/Dockerfile` |

### Verification (Round 5)

- `go build ./...`: PASS (zero errors)
- `npx turbo build --force`: PASS (6/6 packages, 13 pages incl. manifest, 0 errors)
- No unused imports, no string-based error matching remaining in agent/connection handlers

---

## Round 6: Deep Security + Validation + Accessibility (2026-02-24)

### Batch 1: Security Headers + Content-Type Enforcement (DONE)

| # | Category | Severity | Fix | File |
|---|----------|----------|-----|------|
| 34 | Security | HIGH | RequireJSON middleware (reject non-JSON Content-Type on POST/PUT/PATCH) | `middleware/security.go`, `cmd/api/main.go` |
| 35 | Security | HIGH | Frontend CSP/security headers shipped through static host `_headers` (static export compatible) | `apps/web/public/_headers` |
| 36 | Security | LOW | HSTS preload directive added | `middleware/security.go` |
| 37 | Security | LOW | Referrer-Policy tightened to no-referrer (password manager = no URL leakage) | `middleware/security.go` |
| 38 | Security | LOW | X-Permitted-Cross-Domain-Policies: none | `middleware/security.go` |

### Batch 2: Validation Tightening (DONE)

| # | Category | Severity | Fix | File |
|---|----------|----------|-----|------|
| 39 | Validation | MEDIUM | Email format check (require @ with non-empty local+domain, require dot in domain) | `handler/auth_handler.go` |
| 40 | Validation | MEDIUM | SRP proof bounds tightened: 32-512 bytes (was 0-1024) | `handler/auth_handler.go` |
| 41 | Validation | MEDIUM | SyncPush item count limit: 1-500 per request | `handler/vault_handler.go` |

### Batch 3: Accessibility (DONE)

| # | Category | Severity | Fix | File |
|---|----------|----------|-----|------|
| 42 | A11y | MEDIUM | aria-label="Password length" on range slider | `components/vault/password-form.tsx` |

### Verification (Round 6)

- `go build ./...`: PASS (zero errors)
- `npx turbo build --force`: PASS (6/6 packages, 13 pages, 0 errors)

---

## Round 7: Deep Security + Frontend Quality + API Hardening

### Batch 1: Security (DONE)

| # | Category | Severity | Fix | File |
|---|----------|----------|-----|------|
| 43 | Security | CRITICAL | Session token moved from sessionStorage to Zustand memory-only (XSS mitigation) | `login/page.tsx`, `(vault)/layout.tsx` |
| 44 | Security | HIGH | Vault item sentinel error (ErrItemNotFound) -- eliminates fragile string matching | `domain/errors.go`, `vault_repo.go`, `vault_handler.go` |
| 45 | Security | HIGH | TOTP status endpoint (GET /auth/totp/status) -- was called by frontend but missing | `totp_handler.go`, `totp_service.go`, `main.go` |
| 46 | Security | HIGH | Auth rate limiter tightened: 10 req/min to 5 req/min on register/login | `main.go` |

### Batch 2: Frontend Quality (DONE)

| # | Category | Severity | Fix | File |
|---|----------|----------|-----|------|
| 47 | Security | MEDIUM | Clipboard auto-clear simplified: unconditional write after 30s (removes readText timing oracle) | `password-detail.tsx` |
| 48 | UX | MEDIUM | Navigation icons: replaced hardcoded emoji with Heroicons SVG paths (accessible, consistent rendering) | `(vault)/layout.tsx` |

### Batch 3: API Hardening (DONE)

| # | Category | Severity | Fix | File |
|---|----------|----------|-----|------|
| 49 | API | MEDIUM | Pagination offset cap reduced from 10000 to 5000 | `vault_handler.go` |
| 50 | API | MEDIUM | Audit API: URLSearchParams for query string construction (prevents edge-case encoding bugs) | `api.ts` |

### Verification (Round 7)

- `go build ./...`: PASS (zero errors)
- `npx turbo build`: PASS (6/6 packages, 13 pages, 0 errors)

## WP-015 Local Delivery Hardening (2026-05-31)

### Fixed In Current Boundary

| # | Category | Severity | Fix | Evidence |
|---|---|---|---|---|
| 51 | Database | HIGH | Removed volatile `NOW()` partial index predicate from migration 009; added migration SQL regression test | `services/api/migrations/migration_sql_test.go` |
| 52 | MCP Security | CRITICAL | Unknown policy types now fail closed | `packages/mcp-protocol/src/policy-engine.test.ts` |
| 53 | MCP Security | CRITICAL | API/Web/MCP policy enum names aligned to canonical policy types | `services/api/internal/handler/agent_handler_test.go` |
| 54 | MCP Security | CRITICAL | Item-scope policy denies when required request attributes are missing; MCP requests include item identity | `packages/mcp-protocol/src/server.ts` |
| 55 | Release Gate | MEDIUM | `make postmortem-scan` no longer depends on stale hardcoded base SHA | `Makefile` |

### Final Local Gates

- `ai check --json --no-sbom --base-dir /Users/mauricewen/Projects/10-auth-box`: PASS (`outputs/check/20260531T104046Z-wp015-final2`).
- MCP package test/build: PASS.
- Web typecheck/build: PASS.
- API Go tests: PASS.
- Real API E2E: PASS 65/65.
- Web route smoke: PASS 12/12.
- iOS SwiftPM/UI: PASS.
- Postmortem scan: PASS.

### Remaining Release Blockers

- WP-015 local code blockers above are superseded by WP-016 and fixed locally.
- GitHub/VPS/production commit and public API health consistency are not verified in this local-only run.
- `pnpm lint` remains blocked by existing `apps/web` `next lint` interactive ESLint setup prompt.

## WP-016 Local Release-Blocker Reduction (2026-05-31)

### Fixed In Current Boundary

| # | Category | Severity | Fix | Evidence |
|---|---|---|---|---|
| 56 | Auth | HIGH | SRP M2 server proof verification in web, extension, iOS, and crypto tests | `srpVerifyServerProof`, iOS `verifyServerProof` |
| 57 | Secret Handling | HIGH | Removed API keys from URL query strings in active health/MCP auth paths | static `rg` guard + web build |
| 58 | MCP Security | HIGH | Proxy tool rejects host mismatch, private DNS/IP targets, credential headers, disallowed methods, and oversize bodies | `proxy-security.test.ts` |
| 59 | TOTP Security | HIGH | TOTP seeds stored as AES-GCM envelopes; plaintext seeds rejected; migration 010 disables legacy plaintext enrollments | Go service tests + migrations |
| 60 | API Security | MEDIUM | PNA header only on explicit preflight; JSON content-type parsed strictly | Go middleware tests |
| 61 | UX/Security | MEDIUM | TOTP manual setup values hidden by default and cleared on enrollment timeout | web typecheck/build + source guard |
| 62 | Extension Security | MEDIUM | MV3 host permissions narrowed and AuthBox/local origins excluded from content scripts | extension typecheck/build |

### Final Local Gates

- `ai check`: PASS (`outputs/check/20260531-115040-dc90d291`).
- TS crypto test/build: PASS.
- MCP protocol test/build: PASS.
- API Go tests: PASS (`go test ./...`).
- iOS Swift tests + simulator build: PASS.
- Web typecheck/build: PASS.
- Extension typecheck/build: PASS.
- Static secret/query guard + `git diff --check`: PASS.
- Chrome headless static route smoke: PASS for protected `/settings.html` redirect.

## WP-017 Console Release Gate Dependency Security (2026-05-31)

| Area | Result | Evidence |
|---|---|---|
| Console dependency security | `next@14.2.5` replaced with `next@15.5.18`; critical/high npm audit findings closed | `apps/console/package.json`, `apps/console/package-lock.json` |
| Next 15 compatibility | Dynamic `params` and query `searchParams` are awaited according to App Router async prop contract | `apps/console/app/**/page.tsx` |
| Build gate | Console production build passes; 31 app routes generated | `npm run build` in `apps/console` |
| Audit gate | High/critical threshold passes; remaining PostCSS advisory is moderate | `npm audit --audit-level=high`, `npm audit --json` |
| Release gate | P0 local release gate passes with explicit gatekeeper | `outputs/release-gate/20260531T154354Z/reports/release_gate_summary.json` |

优化结论：本地发布门禁的 console critical/high audit blocker 已关闭；公开生产推广仍需远端 workflow、VPS/production 与 public API health 证据。

## WP-019 Public API Health Recovery Guardrail (2026-06-01)

| Area | Result | Evidence |
|---|---|---|
| GitHub convergence | PASS | local `HEAD` and `origin/main` both `175e3317bedd79474368a867b80b8f1df9c3a5ab`; latest Release Gate and Agent Design Check PASS |
| Public API DNS | BLOCKED | `api.authbox.io` is NXDOMAIN via `@1.1.1.1`; `@8.8.8.8` returns no answer |
| VPS runtime access | BLOCKED | `ssh vps-prod` closes on `198.18.3.63:22` |
| Cloudflare authority | BLOCKED | current Cloudflare API account cannot view the owning `authbox.io` zone and cannot list Pages projects |
| Runtime guardrail | ADDED | `docker-compose.vps.yml` binds API/PostgreSQL to `127.0.0.1` only |

Optimization conclusion: public API recovery is now a production infra task, not a Go route bug. Required repair is DNS/Tunnel ownership plus VPS runtime start from the loopback-only compose entrypoint.

## Changelog
- 2026-03-22: 回写静态安全头、API base 显式配置与发布就绪性检查结论，并补齐 changelog 区块。（原因：auth reliability + release readiness）
- 2026-05-31: 新增 native iOS baseline closeout 记录，重点收口生成物治理、跨平台 crypto parity 与本地 simulator 证据。（原因：Projects folder dirty worktree closeout）
- 2026-05-31: 同步 WP-015 local hardening fixes、final gates 与 remaining release blockers。（原因：SOP one-click delivery closeout）
- 2026-05-31: 同步 WP-016 local release-blocker reduction，清除上一轮本地安全 blocker 并记录剩余线上发布门禁。（原因：local release-blocker hardening）
- 2026-05-31: 同步 WP-017 console dependency security convergence，本地 release gate 已通过，线上发布仍需远端与 public API health 证据。（原因：release gate convergence）
- 2026-06-01: 同步 WP-019 public API health recovery guardrail；新增 VPS-safe compose 并记录 DNS/Tunnel/VPS authority blockers。（原因：release convergence continuation）
