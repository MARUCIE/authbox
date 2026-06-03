---
Title: task_plan - initiative_10_auth_box
Scope: project
Owner: ai-agent
Status: active
LastUpdated: 2026-05-31
---

# 任务计划 - Auth Box v2

## 目标

交付零知识加密密码管理器 + 授权管理器 + AI Agent 凭据网关，以 Turborepo + pnpm monorepo 为基础。

## 非目标

- 不替代企业级 IAM（Okta/Auth0）
- 不兼容 v1 数据格式与 API
- 不做通用 API 网关

## 约束

- 零知识架构：Master Password 永不离开客户端
- SRP-6a 认证：服务端不存储密码或密码哈希
- 所有加密/解密在客户端完成
- 必须通过 ai check + UX Map 人工测试

## 验收标准

- PDCA 四文档口径一致并完成更新
- Monorepo 构建通过 (`npx turbo build`)
- 12/12 页面静态生成成功
- 所有 7 条用户旅程（A-G）可模拟走通
- UX Map 路由地图与实际页面一致

## 测试计划

- Round 1: `ai check` 或等效构建/lint 验证
- Round 2: UX Map 手工模拟测试（按 Journey A-G + 路由地图逐页验证）

## Phase 0 Checklist (DONE)

- [x] PDCA 文档 v2 重写（PRD / Architecture / UX Map / index）
- [x] Turborepo + pnpm monorepo 脚手架（6 packages）
- [x] @authbox/crypto 包：Argon2id + HKDF + AES-256-GCM + SRP-6a
- [x] @authbox/shared 包：类型定义 + 常量 + 工具函数
- [x] Go API 骨架：SRP 端点 + Vault CRUD + 健康检查（mock server via MSW）
- [x] Next.js 15 Web App：注册/登录页面
- [x] Docker Compose + Makefile 更新
- [x] 数据库迁移脚本（v2 Schema via Go migrations）

## Phase 1 Checklist (DONE)

- [x] vault-crypto.ts: 加密/解密 Vault Items
- [x] Vault layout + 密码列表/表单/详情/生成器/搜索
- [x] 密码强度指示器（注册页 + 密码表单）
- [x] Audit log viewer（hash-chain verification）
- [x] Settings page（session management + TOTP 2FA）

## Phase 2 Checklist (DONE)

- [x] Agent CRUD 页面（注册/详情/策略编辑）
- [x] OAuth Connection 管理（连接列表/新建/详情/断开）
- [x] 密码导入向导（1Password/Bitwarden/Chrome CSV）
- [x] @authbox/shared types 完善

## Phase 3 Checklist (DONE)

- [x] @authbox/mcp-protocol: MCP Server + Tools + Policy Engine
- [x] Chrome Extension scaffold: MV3 manifest + popup + content script
- [x] Extension: service worker + vault cache + MCP gateway
- [x] Extension: autofill (form detection + fill injection)
- [x] Extension: step-up approval flow（popup notification + promise-based resolve）

## Phase 4 Checklist (DONE)

- [x] TOTP 2FA: enroll/verify/disable flow
- [x] Session management UI: list/revoke/revoke-all
- [x] Rate limiting patterns（Redis-backed）
- [x] Security hardening patterns (CORS/CSP)

## Gap Fixes (DONE)

- [x] OAuth real encryption（connections page uses Vault Key encryption）
- [x] Password import wizard（CSV parse + bulk encrypt + push）
- [x] MCP step-up approval（promise-based with 60s timeout）

## UX Optimization Round 1 (DONE -- 12/12 fixes)

- [x] Fix 1: Landing page CTA -> `/register`
- [x] Fix 2: Registration SRP progress steps
- [x] Fix 3: Login multi-step SRP progress
- [x] Fix 4: Vault layout sidebar navigation
- [x] Fix 5: Password list search + dialog-based new/edit
- [x] Fix 6: Password detail copy-to-clipboard (30s auto-clear)
- [x] Fix 7: Password generator integration
- [x] Fix 8: Registration password strength indicator
- [x] Fix 9: Landing page three pillars + trust signals
- [x] Fix 10: 2FA status check on mount
- [x] Fix 11: Search "/" keyboard shortcut
- [x] Fix 12: UX Map route alignment

## 当前阶段：UX Optimization Round 2 -- ralph loop

目标：按 UX Map 7 条旅程做模拟人工测试，发现并修复剩余问题。

- [x] Journey A 模拟：注册流程端到端 -- PASS
- [x] Journey B 模拟：登录流程端到端 -- PASS
- [x] Journey C 模拟：密码管理 CRUD -- PASS
- [x] Journey D 模拟：浏览器扩展自动填充 -- PASS
- [x] Journey E 模拟：Agent 设置 -- PASS (policy creation UI added)
- [x] Journey F 模拟：MCP 连接 -- PASS
- [x] Journey G 模拟：OAuth 管理 -- PASS
- [x] 路由地图逐页验证 -- 9/9 routes HTTP 200, HTML 内容包含关键 UI 元素
- [x] 构建验证 (0 errors, 12/12 pages) -- 6/6 packages, 12/12 pages
- [x] PDCA 文档同步更新 -- PRD/SYSTEM_ARCHITECTURE/USER_EXPERIENCE_MAP 状态同步
- [x] Task Closeout -- deliverable.md 更新, PDCA 同步, notes.md 证据落盘

## 阶段

1. Phase 0: 基础设施（Monorepo + Crypto + API 骨架）-- DONE
2. Phase 1: 核心密码管理（注册/登录/Vault CRUD）-- DONE
3. Phase 2: Agent + OAuth + Import -- DONE
4. Phase 3: MCP Gateway + Extension -- DONE
5. Phase 4: Hardening（2FA + Sessions + Rate Limiting）-- DONE
6. UX Optimization Round 1 -- DONE (12/12 fixes)
7. UX Optimization Round 2 -- DONE (ralph loop: 2 gaps fixed, 7/7 journeys PASS)

## Round 3: Real API Fixtures (DONE)

目标：Docker Compose 启动 PostgreSQL + Redis + Go API，真实 API 端到端测试（no mock）。

- [x] Docker Compose 基础设施（PostgreSQL 16 + Redis 7 + Go API）
- [x] 数据库迁移（7 migrations, version=7）
- [x] Bug 修复：chi Router route overlap（public auth endpoints 被 protected middleware 拦截）
- [x] 20/20 端点测试通过（4 public + 16 protected）
- [x] Access control 验证（6 protected endpoints 正确返回 401）
- [x] 证据落盘（notes.md 更新）

## Round 4: Hardening Optimization (DONE)

目标：基于 21 项优化扫描结果，批量修复安全/性能/基础设施问题。

- [x] CSP header: connect-src 'self' (CRITICAL)
- [x] X-Forwarded-For IP spoofing: centralized ClientIP() (HIGH)
- [x] HTTP server full timeout suite: Read/Write/Idle (HIGH)
- [x] Vault SyncPull pagination (HIGH)
- [x] Docker API health check + restart policies (HIGH)
- [x] DB connection pool config: max=20, idle=5m (MEDIUM)
- [x] Request body size limit: 1MB middleware (MEDIUM)
- [x] Vault ListItems pagination: limit/offset (MEDIUM)
- [x] Audit pagination bounds clamp: limit 1-200 (MEDIUM)
- [x] String length validation on registration (MEDIUM)
- [x] ItemType enum validation (MEDIUM)
- [x] Docker memory limits: API=256M, Web=512M (MEDIUM)
- [x] Audit writeError params order fixed (LOW)
- [x] Build verification: go vet + go build + turbo build PASS

## Round 8: Rate Limiter Fix + Arweave E2E Tests (DONE)

- [x] Fixed-window rate limiter: replaced sliding-window (rejected requests extended window) with fixed-window (window expires naturally)
- [x] Config: AUTH_BOX_AUTH_RATE_LIMIT env var (defaults to 5, configurable for E2E)
- [x] Retry-After header: returns actual seconds remaining in window (not fixed 60s)
- [x] E2E test: 429-aware retry logic (waits for window reset, then retries once)
- [x] VPS API redeployed with fixed-window rate limiter
- [x] E2E tests: 21/21 ALL PASS
- [x] Arweave vault test suite: 10 tests (identity hash, encrypt/decrypt roundtrip, unstoppable recovery flow, Arweave API)
- [x] Full crypto test suite: 53/53 PASS (22 crypto + 21 seed + 10 arweave)
- [x] Build: 7/7 turbo packages PASS

## Round 9: Go Middleware Test Suite (DONE)

- [x] Rate limiter tests (8): within-limit, over-limit, Retry-After accuracy, per-IP isolation, window reset, rejected-requests-dont-extend (regression guard), XFF, response body
- [x] Security middleware tests (11): SecurityHeaders, RequireJSON, PNA, ClientIP, BodySizeLimit
- [x] Go test suite: 25/25 PASS (6 SRP + 8 rate limiter + 11 security)

## Round 10: Full-Stack E2E Rewrite (DONE)

- [x] Real SRP-6a authentication: srpGenerateVerifier + srpClientInit + srpClientVerify (TypeScript crypto)
- [x] Vault CRUD lifecycle: create(credential) → list → get → update → delete → verify 404
- [x] Agent CRUD lifecycle: create → list → get → update → delete
- [x] Audit trail: list events + chain integrity verification
- [x] Session management: list active sessions
- [x] TOTP status: check disabled for new user
- [x] Logout + token invalidation: logout → verify token rejected
- [x] Security: unauthenticated rejection (5 endpoints), fake token, content-type, headers
- [x] E2E: 53/53 ALL PASS (12 test groups, real SRP login)

## Round 11: Auth Reliability + SLA Hardening (DONE)

- [x] Fixed TOTP login continuation: SRP pending state now survives until `/auth/login/totp/verify`
- [x] Fixed audit chain verification window: verifies the most recent 10k events in chronological order
- [x] Fixed client contract drift: web + extension now send `clientPublicA` on `/auth/login/verify`
- [x] Fixed stale TOTP reads: login flow refreshes user state by `userID` before step-up decision and TOTP completion
- [x] Fixed `FindByEmail` TOTP field hydration in PostgreSQL repository
- [x] Fixed hardcoded per-email limiter: now uses configurable threshold (`AUTH_BOX_AUTH_RATE_LIMIT`)
- [x] Added regression tests: auth service TOTP continuation + refreshed user state, email limiter pruning/configured max, audit chain recent-segment verification
- [x] Static-export security headers moved from ineffective `next.config.ts headers()` to `apps/web/public/_headers`
- [x] Removed hardcoded `trycloudflare` API defaults from web/console/extension/E2E; local defaults remain `localhost`, non-local now requires explicit env
- [x] Real API validation: local PostgreSQL + Go API on `:8080` + `scripts/e2e-test.mjs` 65/65 PASS

## Round 12: Local Release-Blocker Reduction (DONE, 2026-05-31)

目标：收口上一轮 attacker review 留下的本地可修复发布 blocker；不触碰 GitHub、VPS、Cloudflare 或生产环境。

- [x] SRP M2 server proof verification now enforced in web, extension, iOS, and shared crypto tests.
- [x] API key query-string leakage removed from Google AI health check and MCP WebSocket auth.
- [x] MCP proxy request SSRF/data-exfiltration guard added: host binding, DNS/private-network rejection, forbidden credential headers, method/body limits.
- [x] TOTP seeds encrypted at rest with `AUTH_BOX_TOTP_SECRET_KEY`; plaintext stored seeds are rejected; migration 010 disables pre-existing plaintext enrollments.
- [x] API middleware tightened: PNA is preflight-only, JSON media type parsing rejects spoofed prefixes, missing `Content-Type` with body is rejected.
- [x] Settings TOTP manual setup values hidden by default with enrollment expiry cleanup.
- [x] Chrome extension permissions reduced from global host access to AuthBox/local API hosts plus normal page content-script matches and exclusions.
- [x] Verification: package tests/builds, Go tests, Swift tests, web/extension builds, iOS simulator build, `ai check`, static guards, and Chrome headless route smoke.

## Round 13: Console Release Gate Dependency Security (DONE, 2026-05-31)

目标：收口 GitHub 发布前的本地 release gate blocker；不触碰 Cloudflare/VPS/production。

- [x] Root cause: `apps/console` pinned `next@14.2.5`, causing `console_security_audit` to fail P0 release gate on critical npm advisories.
- [x] Upgrade path: move console to `next@15.5.18` instead of staying on Next 14.x, because `next@14.2.35` still leaves high audit findings.
- [x] Compatibility fix: update App Router dynamic page `params` and `searchParams` props to the async Next 15 contract.
- [x] Build validation: `npm run build` in `apps/console` PASS; 31 app routes generated.
- [x] Security validation: `npm audit --audit-level=high` PASS; npm audit metadata now reports `critical=0`, `high=0`, `total=2` (remaining PostCSS advisory is moderate).
- [x] Release gate: `GATEKEEPER=MARUCIE BASE=origin/main HEAD=HEAD make release-gate` PASS; summary at `outputs/release-gate/20260531T154354Z/reports/release_gate_summary.json`.
- [x] Round 1: `ai check` PASS with two rounds; run dir `outputs/check/20260531-154415-114f8034`.
- [x] Remaining boundary: public promotion still requires GitHub check evidence after push plus VPS/production/public API health verification.

## Round 14: GitHub Agent Design Check Convergence (DONE, 2026-05-31)

目标：修复 push 后 GitHub `Agent Design Check` 的文档锚点漂移；不改业务代码。

- [x] Root cause: `scripts/agent_design_check.sh` requires exact PRD and UX Map anchors for professional agent design SOP, but current docs no longer contained those exact headings.
- [x] Fix: restore `## SOP：专业智能体设计（2026-02-18）` in PRD and `## Journey I: 专业智能体执行闭环（新增，2026-02-18）` in UX Map.
- [x] Preserve iOS journey by renumbering it to Journey J.
- [x] CI portability fix: replace `rg` title checks with `grep -Fq` because GitHub workflow only guarantees `jq` and `bash`.
- [x] Verification: `scripts/agent_design_check.sh --output /tmp/authbox-agent-design-check-after.json` PASS.

## 当前状态

- 所有 MVP 功能阶段已完成（Phase 0-4 + Gap Fixes + UX Round 1-2 + Round 3-11）
- 构建通过：targeted packages + Web/Extension + iOS simulator, 16 Web pages, 0 errors
- 最新验证基线：`make test-api` PASS + `make test-crypto` PASS（51 deterministic + 2 live skipped） + `scripts/e2e-test.mjs http://localhost:8080` 65/65 PASS
- 最新 release gate 基线：`GATEKEEPER=MARUCIE BASE=origin/main HEAD=HEAD make release-gate` PASS（`outputs/release-gate/20260531T154354Z/reports/release_gate_summary.json`）
- Follow-up drift cleanup: README / UX baseline synced to 2026-03-22 reality, `_headers` no longer allows `*.trycloudflare.com`, runtime scan shows no temporary tunnel dependency outside historical docs
- Release readiness checkpoint (2026-03-22): `authbox.io` public routes (`/`, `/login`, `/register`, `/create`, `/unlock`, `/settings`, `/manifest.webmanifest`) return 200 with security headers, but public API health is not proven (`/health` on authbox.io = 404; `api.authbox.io` unresolved)
- Project gate checkpoint (2026-03-22): `ai check --json --no-sbom --base-dir /Users/mauricewen/Projects/10-auth-box` PASS (`outputs/check/20260322-021252-a7b35035`); patched `scripts/release_gate.sh` now reuses the same project-scoped gate and passes on current worktree (`outputs/release-gate/20260322T021557Z/`)
- Three-end consistency is currently BLOCKED: local committed HEAD and `origin/main` both at `97336bf`, while `vps-prod:/root/10-auth-box` is `850c226` and dirty (`?? docker-compose.vps-local.yml`); VPS `localhost:4010/health` refused connection
- Release gate cannot represent the current fixes until they are committed; existing `release-gate` / `risk-classify` scripts only evaluate committed ref ranges
- 2026-05-31 local release-blocker reduction: prior local security blockers for SRP M2, query-string API keys, MCP proxy SSRF, plaintext TOTP seeds, PNA/content-type hardening, settings TOTP exposure, and extension host permissions are fixed with fresh tests/builds; public release remains blocked until GitHub/VPS/production consistency and public API health are explicitly verified.
- 7/7 UX Map Journeys PASS, 9/9 routes HTTP 200
- Round 3: 20/20 real API endpoints tested (PostgreSQL + Go API, no mock)
- Round 4-7: 50 security/performance optimizations
- Round 8: Fixed-window rate limiter + Arweave test suite + VPS redeployed
- Round 9: Go middleware test suite (rate limiter + security)
- Round 10: Full-stack SRP E2E rewrite (vault + agent + audit + session + TOTP + logout)
- VPS topology: CF Pages → Cloudflare Tunnel → VPS:4010 (Go API) → PG:5410
- Repository 接口化: DONE (domain/repository.go, 6 interfaces, DDD pattern)
- TOTP 前后端对接: DONE (4 endpoints + Settings UI)
- Unstoppable recovery: VERIFIED (seed → vault key → encrypt → decrypt roundtrip)

## 决策记录

- 2026-02-24: Auth Box v2 方向转型，从"API 授权治理"转为"零知识加密密码管理器 + AI Agent 网关"。PDCA 文档全部重写。
- 2026-02-24: 技术栈确定：Go 1.22+ / Next.js 15 / React 19 / Chrome MV3 / Turborepo / pnpm。
- 2026-02-24: 加密方案确定：Argon2id -> HKDF -> AES-256-GCM, SRP-6a 认证。
- 2026-02-24: MCP Gateway 方案确定：浏览器扩展内嵌 MCP Server (ws://localhost:19876/mcp)。
- 2026-02-24: Phase 0-4 全部完成，进入 UX 优化阶段。
- 2026-02-24: UX Round 1 完成 12/12 fixes，进入 Round 2 ralph loop。
- 2026-03-21: Rate limiter 从滑动窗口改为固定窗口 (fixed-window)。原设计在拒绝请求时也刷新窗口，导致 429 无法自然恢复。
- 2026-03-21: E2E 重写为真实 SRP 登录 + 全栈 CRUD。测试总量从 70 → 131 (+87%)。
- 2026-03-22: 认证链路硬化：TOTP step-up 登录、邮箱级限流和静态导出安全头全部按真实运行路径校正，验证基线切换为 local API 65/65 E2E。
- 2026-03-22: 验收命令必须在 `PROJECT_DIR` 执行；从 `/Users/mauricewen/00-AI-Fleet` 触发的 `ai check` 结果视为无效，不纳入 Auth Box 项目验收。
- 2026-03-22: 公共站点可达不等于可公开发版；发布前必须同时满足本地/GitHub/VPS commit 收敛、线上 API health 可证、以及项目目录内 `ai check` 有效结果。

## 2026-05-31: Projects Folder Dirty Worktree Closeout (WP-014)

目标：把 `/Users/mauricewen/Projects/10-auth-box` 的 114 项 dirty/untracked 工作树收口为可审计本地基线，避免生成物、发布证据输出和新 iOS 源码混在同一 dirty 状态中。

已完成：
- 将 `apps/ios` 识别为候选 native iOS baseline，而非生成物噪声。
- 将 SwiftPM `.build`、Xcode `build`、runtime output dirs 与 `*.tsbuildinfo` 纳入 `.gitignore`。
- 从 Git index 移除 4 个已跟踪 `tsconfig.tsbuildinfo` 生成缓存（本地文件保留并由 ignore 接管）。
- 为 iOS/Web crypto vector 新增 repeatable root script：`pnpm run ios:crypto-vectors`。
- 更新 PRD / SYSTEM_ARCHITECTURE / USER_EXPERIENCE_MAP / PLATFORM_OPTIMIZATION_PLAN / path index。

本地验证：
- `swift test` in `apps/ios/AuthBoxCrypto`: PASS, 62 tests.
- `pnpm run ios:crypto-vectors`: PASS.
- `node apps/ios/cross-platform-test.mjs`: PASS.
- `pnpm --filter @authbox/crypto test`: PASS, 51 passed / 2 skipped.
- `pnpm --filter @authbox/crypto build`: PASS.
- `pnpm --filter @authbox/shared build`: PASS.
- `pnpm --filter @authbox/mcp-protocol build`: PASS.
- `xcodebuildmcp build_sim` for `AuthBox`: PASS.
- `xcodebuildmcp test_sim` for `AuthBox`: PASS, 1 UI test, zero warnings/errors.
- Project `ai check`: PASS via `GOPROXY=https://goproxy.cn,direct GOSUMDB=sum.golang.google.cn`; default-proxy attempt failed only on Go module TLS handshakes.

Scope boundary：本轮不执行 GitHub push、Cloudflare Pages deploy、VPS 变更、生产数据操作或历史重写。

## 2026-05-31: SOP One-Click Full Delivery Continuation (WP-015)

目标：把用户提供的 Step 0 / SOP 约束转化为可审计、可续跑的本地执行循环；先建立证据链与安全边界，再运行 Round 1 自动化检查、Round 2 UX Map 模拟、attacker review 与 Task Closeout。

非目标：
- 不自动 push / PR / GitHub 评论 / Issue / 邮件 / 社媒沟通。
- 不触碰 VPS、Cloudflare、生产数据或真实用户凭据。
- 不做历史重写、生产发布或破坏性清理。
- 不在未验证前宣称 release-ready。

约束与路由决策：
- 当前 Codex App 在 outside-tmux surface，`omx team` / `omx question` / runtime `ralph` 不能直接作为 tmux overlay 使用；本轮用 planning-with-files + native subagents + 本地命令队列模拟 ralph loop，最大 12 轮，completion promise = DONE。
- 命令队列必须从 `PROJECT_DIR` 执行，并以 `set -euo pipefail` 防止跑错目录与静默失败。
- Tool selection priority: DNA capsule -> installed skill/plugin/MCP -> local scripts/Makefile -> manual bounded command。
- Frontend automation priority for this surface: Playwright-capable local/browser tool first; unavailable时降级到 agent-browser；不使用生产站点作为默认验收路径。
- Security/attacker review 是发布前强制门禁；已派发 read-only subagent。
- Speed governance：可并行化，但不跳过 docs/tests/security review。

验收标准：
- `task_plan.md` / `notes.md` / `deliverable.md` / `PDCA_ITERATION_CHECKLIST.md` 记录本轮目标、证据、阻塞与收尾状态。
- DNA search / validate / doctor 有新鲜证据；若沉淀新 capsule，必须通过 `ai dna validate` + `ai dna doctor`。
- CodeGraph 状态已检查；若初始化索引，`.codegraph/` 作为本地 cache 不进入 Git。
- Round 1：项目级 `ai check` 或更强等效自动化检查通过，并保存证据目录。
- Round 2：按 UX Map route/journey 做本地模拟测试并记录证据；若本地服务不可用，明确 blocked evidence。
- Attacker review 完成，权限绕过/注入/越权/数据暴露面有结论或待修项。
- Task Closeout 更新 deliverable / Rolling Ledger / 三端一致性状态。

测试计划：
1. Preflight: `git status --short --branch`, tool availability, DNA search/validate/doctor, CodeGraph status/index as needed。
2. Automated gates: `ai check --json --no-sbom --base-dir /Users/mauricewen/Projects/10-auth-box --outdir outputs/check/<run-id>`; targeted package checks if `ai check` exposes a narrow blocker。
3. UX simulation: derive actual routes from `apps/web` / `apps/console` and UX Map; run local server or Docker only if required; capture route, console/network, and screenshot evidence when browser tooling is available。
4. Security review: read-only attacker review subagent + local grep/static checks for CORS/CSP/secrets/auth boundary drift。
5. Closeout: update docs and ledger; do not mark complete until every explicit requirement has evidence or a documented N/A/blocker。

Initial evidence captured:
- Project root: `/Users/mauricewen/Projects/10-auth-box`.
- Worktree before edits: clean; branch `main...origin/main [ahead 1]`; HEAD `4b12253`.
- Required planning files exist.
- `ai`, `omx`, `pnpm`, `go`, Docker, and `npx` are installed.
- Default AI-tools DNA registry validates and doctors successfully; no project-local DNA registry exists yet.
- CodeGraph status before indexing: not initialized.

Next queue:
- Run CodeGraph init/index after ignoring `.codegraph/`.
- Run project-level `ai check` with a fresh output directory.
- Integrate subagent attacker/verifier results.
- Update deliverable only after fresh gates produce evidence.

Closeout update:
- CodeGraph: initialized, synced, and final status is up to date (247 files, 2,806 nodes, 5,761 edges).
- Round 1: final `ai check --json --no-sbom --base-dir /Users/mauricewen/Projects/10-auth-box --outdir outputs/check/20260531T104046Z-wp015-final2` PASS (`ok=true`, two rounds).
- Round 2: real API E2E PASS 65/65 on ephemeral PostgreSQL/API; final web UX route smoke PASS 12/12; iOS SwiftPM crypto PASS 62 tests; iOS UI simulator PASS 1/1.
- Critical defects fixed: PostgreSQL migration volatile partial index; MCP policy fail-open/enum drift/missing item identity.
- Postmortems added: `PM-20260531-001-postgres-partial-index-now.md`, `PM-20260531-002-mcp-policy-fail-open.md`.
- DNA capsule added and synced: `auth-box-delivery-preflight`; `ai dna validate` PASS, `ai dna doctor` no drift after sync.
- Attacker review: critical issues fixed; remaining high/medium security findings are documented as release blockers.
- Three-end consistency: N/A for this local-only run; no GitHub/VPS/production action authorized or executed.
- Final state: local SOP delivery PASS, public release BLOCKED pending security backlog + GitHub/VPS/production consistency.

## 2026-06-01: Public API Health Blocker Triage (WP-019)

目标：把剩余线上发布阻塞拆成可执行项，优先只读验证 public DNS/TLS/HTTP、GitHub workflow、VPS alias 与本地部署拓扑；不执行生产变更、DNS 写入、VPS 重启或 Cloudflare deploy。

证据：
- Local/GitHub commit convergence: verified at diagnostic baseline before the WP-019 guardrail commit; production repair must sync to the latest pushed `origin/main` SHA after CI passes, not a hardcoded document value.
- GitHub workflows: Release Gate and Agent Design Check were green at the diagnostic baseline and must be re-read after each pushed guardrail commit.
- Local code route: Go API registers `GET /health`; Docker API healthcheck calls `http://localhost:8080/health`.
- Public site: `https://authbox.io/` returns HTTP 200 with Cloudflare headers.
- Public API DNS: `dig @1.1.1.1 api.authbox.io` returns NXDOMAIN; `dig @8.8.8.8 +short api.authbox.io` returns no record.
- Public API HTTP/TLS: local resolver returns a proxy-range `198.18.3.60`, but `curl -vk https://api.authbox.io/health` fails at TLS with `SSL_ERROR_SYSCALL`; `http://api.authbox.io/health` returns empty reply.
- Cloudflare API: current account does not expose the `authbox.io` zone; Pages project listing fails with authentication error, so DNS/Pages repair cannot be performed from this credential.
- VPS alias: `ssh vps-prod ...` closes on `198.18.3.63:22`, so current session cannot prove VPS repo/runtime state.

Decision:
- Added `docker-compose.vps.yml` as the production-safe VPS runtime entrypoint with API/Postgres bound to `127.0.0.1` only.
- Public release remains BLOCKED until the owning Cloudflare zone has `api.authbox.io` configured and VPS/Tunnel runtime health returns 200.

Next production change set, not executed in this local session:
1. Sync `/root/10-auth-box` to the latest pushed `origin/main` SHA after Release Gate and Agent Design Check pass.
2. Provide server-local `AUTH_BOX_POSTGRES_PASSWORD`, `AUTH_BOX_DB_DSN`, and `AUTH_BOX_TOTP_SECRET_KEY`.
3. Start `docker compose -f docker-compose.vps.yml up -d --build` and verify `curl http://127.0.0.1:4010/health`.
4. In the Cloudflare account that owns `authbox.io`, create/route `api.authbox.io` through Cloudflare Tunnel to `http://127.0.0.1:4010`.
5. Verify `dig @1.1.1.1 api.authbox.io` and `curl -fsS https://api.authbox.io/health`.

---

Maurice | maurice_wen@proton.me

## Changelog
- 2026-03-22: 新增 release readiness checkpoint、三端一致性阻塞项与项目级 `ai check` 兼容收口任务。（原因：release readiness hardening）
- 2026-06-01: 追加 WP-019 public API health blocker triage，记录权威 DNS NXDOMAIN、VPS alias 不可读、GitHub checks PASS，并给出生产恢复 change set。（原因：release convergence continuation）


## 2026-06-01 · WP-020 — Auth Box for Mac (native macOS app) · Atomic Execution Queue

Goal: native SwiftUI macOS app fusing vault + 70+ AI provider hub + agent-authorization
broker, gated by Touch ID, reusing AuthBoxCrypto. Architecture: doc/10_features/macos-native-app/ARCHITECTURE.md.

### P0 — Scaffold (build green on macOS 14)
- [x] Add `apps/macos/AuthBoxMac` SwiftUI target via XcodeGen (project.yml canonical, .xcodeproj derived/gitignored) — isolated from iOS pbxproj
- [x] Link `AuthBoxCrypto` SwiftPM — PROVEN: macOS build compiled Argon2/SRP/HKDF/AES256GCM/Seed/VaultCrypto for arm64-apple-macos14.0
- [x] AuthBoxMac.entitlements: app-sandbox + user-selected files + network client/server. DEFERRED to P1 (need DEVELOPMENT_TEAM): app-group group.com.authbox.shared + keychain-access-groups + runtime hardened-runtime (ad-hoc disables it)
- [x] @main AuthBoxMacApp: WindowGroup(RootView 3-domain NavigationSplitView) + MenuBarExtra(MenuBarContent) + LockState stub
- [x] xcodebuild macOS build -> BUILD SUCCEEDED (rc=0, 0 errors, ad-hoc signed Auth Box.app)

### P1 — Auth core (Touch ID + Secure Enclave)
- [x] Core/Auth/BiometricAuth.swift: LAContext wrapper + LAError->AuthError mapping + availability; deny-by-default (any error -> .failure)
- [x] Core/Keychain/SecureEnclaveKeyStore.swift: SE EC-P256 key (.biometryCurrentSet + .privateKeyUsage), ECIES wrap/unwrap
- [x] Core/Vault/VaultSession.swift: SE unwrap = Touch ID gate; master key in SecureBytes, in-memory only while unlocked
- [x] Auto-lock: NSWorkspace.willSleep + com.apple.screenIsLocked + idle Timer -> performLock() zeroes SecureBytes
- [x] AuthBoxMacTests/VaultSessionTests.swift: 4 tests PASS (unlock-holds-key / lock-zeroes / deny-on-unwrap-fail / preonboarding-biometric-gate) -> TEST SUCCEEDED rc=0
- [x] (2026-06-01) Root-cause real-machine `keyCreationFailed(-34018)` at "Finish setup": persistent SE keys need a team-prefixed keychain-access-groups entitlement, only honored under a provisioning-profile-backed signature. Proven via signed probe matrix (ad-hoc/bare-dev-cert all fail). Fix: project.yml automatic signing + entitlements keychain-access-groups re-enabled + package-dmg.sh -allowProvisioningUpdates + scripts/verify-se-signing.sh (commit 6901d0d).
- [x] (2026-06-01) Team correction: initial team L37Q42H4SZ was the orphan keychain-cert's team; the signed-in Apple ID's actual team is `35HKS5847W` ("maoyuan wen Personal Team", from `defaults read com.apple.dt.Xcode IDEProvisioningTeams`). project.yml DEVELOPMENT_TEAM → 35HKS5847W. VERIFIED via verify-se-signing.sh: build SUCCEEDED, embedded profile present, signed entitlements carry keychain-access-groups = 35HKS5847W.com.authbox.mac.
- [x] (2026-06-01) Network gotcha: Apple ID sign-in + dev-portal provisioning need direct network — Surge fake-DNS maps *.apple.com to 198.18.x and breaks TLS. Route apple.com DIRECT (or disable proxy) during sign-in/provisioning.
- [ ] FINAL (user physical step): launch the signed app, tap Touch ID on "Finish setup" to provision the vault. The only step that cannot run headless.
- [x] (2026-06-01) Harden SE failure UX: KeychainError: LocalizedError maps -34018 → signing guidance; OnboardingView uses localizedDescription; KeychainErrorTests pins 4 cases. Suite 46→50 green (commit 1f3e802).
- [ ] HITL (sudo-type credential): add Apple ID `maoyuan.wen@proton.me` in Xcode › Settings › Accounts → `bash scripts/verify-se-signing.sh` → launch app + Touch ID tap on "Finish setup". The only step that cannot be done headless. NOT to be replaced by a software key (security retreat).

### P2 — Vault
- [x] Domain/Vault: reuse seed-phrase HD derivation + item model from AuthBoxCrypto/iOS — VaultService.swift (VaultSecret/VaultItem, encrypt via VaultCrypto.encryptVaultItem); VaultSession.provisionAndUnlock(mnemonic:) reuses Seed.mnemonicToSeed → deriveAllKeys.vaultKey
- [x] Core/Storage: SwiftData store holding ciphertext blobs + metadata only — VaultStore.swift @Model VaultItemRecord (ciphertext/nonce/tag split columns + searchable metadata; plaintext never stored), init(inMemory:) for tests
- [x] Features/Vault: item list, item detail, add/edit/delete — VaultViews.swift (VaultViewModel + VaultListView + AddItemSheet + ItemDetailView reveal-on-demand, onDisappear clears plaintext); Onboarding/OnboardingView.swift (generate/import 24-word mnemonic → provisionAndUnlock); RootView wired (.vault → VaultListView, LockedView ⇄ OnboardingView on isProvisioned)
- [x] Features/Vault: password generator + deterministic derivation (seed+site) — PasswordGenerator.swift (random CSPRNG + deterministic via Seed.derivePassword); Generator/GeneratorView.swift (segmented random/deterministic UI)
- [x] Crypto parity: `pnpm run ios:crypto-vectors` passes for macOS — reference vectors emit clean (M12/M24 valid, vault/sync/auth/agent keys, HKDF, PW_GITHUB=`d$^ton](I(^8R{dprpi%`); macOS links the identical AuthBoxCrypto SwiftPM package as iOS, so deterministic output matches by construction. VaultServiceTests + VaultSessionTests: 11/11 PASS → TEST SUCCEEDED rc=0

### P3 — Provider Hub
- [x] `pnpm run gen:swift-catalog` codegen from credential-catalog.ts → CredentialCatalog.generated.swift — scripts/gen-swift-catalog.ts (tsx) imports CREDENTIAL_CATEGORIES/PROVIDER_TEMPLATES/ENV_PATTERNS, emits typed Swift (AuthPattern/FieldType enums, CredentialCatalog enum). Real output: 15 categories · 91 providers · 108 env patterns.
- [x] CI checksum gate: generated Swift in sync with TS source — `--check` mode regenerates in memory + byte-compares (exit 1 on drift); header embeds sha256(credential-catalog.ts)=2007f208…. `pnpm run gen:swift-catalog --check` → OK in sync.
- [x] Domain/Providers: port env-import-parser.ts → Swift EnvParser — EnvParser.swift (parseEnvFile/parseJsonConfig/classify/group/parseAndClassify; NSRegularExpression case-insensitive matchEnvVar; ordered pairs preserve insertion order). EnvParserTests 5/5 (AWS multi-field merge, JSON autodetect, alias gemini→google_ai).
- [x] Features/ProviderHub: .env drag-drop import + preview + classify-to-provider — ProviderHubView.swift (paste + .fileImporter, preview card grouped by category, "Import N to vault" encrypts via ProviderImportService → provider-tagged VaultItemRecord). VaultSecret extended with optional fields (multi-field providers). Shared VaultStore container so vault+hub see one mainContext.
- [x] Core: port credential-health.ts → Swift health-check probes; one-click verify — CredentialHealth.swift (21-provider registry, injectable HealthTransport seam + URLSessionHealthTransport default, batch concurrency 5). One-click Verify button per provider row with status color/icon. CredentialHealthTests 7/7 (openai 200/401/429, anthropic 400=valid, github body login parse, unchecked, transport-error, batch).
- Verify: xcodebuild -scheme AuthBoxMac -destination 'platform=macOS' test → ** TEST SUCCEEDED ** rc=0, 23/23 (7 CredentialHealth + 5 EnvParser + 7 VaultService + 4 VaultSession).

### P4 — Authorization broker (local MCP Gateway)
- [x] Core/Broker: WebSocket server bound ws://127.0.0.1:19876 (loopback only) — AuthorizationBroker.swift uses Network.framework NWListener + native NWProtocolWebSocket (no hand-rolled RFC6455). Loopback enforced twice: requiredInterfaceType=.loopback + per-connection isLoopbackPeer() check. REAL e2e proof: BrokerTests.test_loopback_websocket_round_trip connects an NWConnection WS client, sends an intent, receives an allowed effect (0.054s, not a stub).
- [x] Domain/Delegation: Swift 五原语 model (Capability/Intent/Policy/Effect/Fact) — DelegationModel.swift (AgentCapability/AccessIntent/AgentPolicy/AccessEffect + AuditFact=Fact in AuditLog). Mirrors shared/types/agent.ts PolicyType/PolicyRules.
- [x] Core/Policy: deny-by-default engine; types item_scope|action_perm|rate_limit|time_window|step_up — PolicyEngine.swift faithful port of policy-engine.ts; fail-closed (empty/disabled/unknown→deny, every policy must pass). Injectable clock for rate_limit/time_window determinism.
- [x] step_up policy → Touch ID prompt + menu-bar consent card (Allow once / Deny) — step_up returns pendingApprovalId; requestApproval suspends (register-before-notify, fail-closed 60s timeout). AuthorizationCenter.resolve() gates "Allow" behind BiometricAuthenticating (Touch ID); AuthorizationsView consent cards Allow once / Deny.
- [x] Policy contract tests mirror policy-engine.test.ts fail-closed cases (unknown type, missing scoped attr) — PolicyEngineTests 9/9: no-policies-deny, all-disabled-deny, scoped-missing-item-type-deny, action allow/deny, rate-limit threshold (injected clock), time-window block, step-up approve+reject, all-policies-must-pass priority order. (Swift enum makes "unknown type" unrepresentable → covered structurally; the missing-scoped-attr fail-closed case is mirrored directly.)
- [x] Features/Authorizations: agent grants, policy editor, tamper-evident audit log (Fact) — AuthorizationsView.swift (broker start/stop, AddGrantSheet add agent + allowed actions + step-up toggle, pending consent, audit list with chain-integrity badge). AuditLog.swift SHA-256 hash chain; AuditLogTests 4/4 (genesis link, intact verify, deterministic hash, distinct decisions). No seeded/demo data.
- Verify: xcodebuild -scheme AuthBoxMac -destination 'platform=macOS' test → ** TEST SUCCEEDED ** rc=0, 41/41 (5 Broker + 9 PolicyEngine + 4 AuditLog + 7 CredentialHealth + 5 EnvParser + 7 VaultService + 4 VaultSession).

### P5 — Security review (attacker gate) + Distribution
- [x] `/security` attacker-review SubAgent pass — fresh-context audit returned 9 findings (1C/2H/4M/2L); all fixed in code (commits db730eb P5a, ccbe57c P5b), 46/46 tests green. Audited-clean: secret logging, AES-GCM/ECIES, SE access control, deny-by-default core, CSPRNG, SwiftData ciphertext-only, entitlements.
  - [x] SEC-001 (Critical): per-agent bearer-token auth on broker — loopback ≠ identity. AgentCapability.tokenHash (SHA-256), AccessIntent.token, constant-time AgentToken.matches; unknown/bad-token denied + audited. BrokerTests +wrong-token deny.
  - [x] SEC-002 (High): persist audit chain (AuditFileStore JSONL); load+continue on launch; loadedIntegrityOK. AuditLogTests +persistence-reload +tamper-detect.
  - [x] SEC-003 (High): withVaultKey borrow closure zeroes transient key copy (resetBytes); vaultKey getter deleted, 7 call sites migrated; masterKeyForTesting #if DEBUG.
  - [x] SEC-004 (Medium): isSafeEndpoint SSRF guard (https-only, refuse loopback/private/link-local/metadata) before egress. CredentialHealthTests +block +classifier.
  - [x] SEC-005 (Medium): tavily body via JSONSerialization; transport drops CR/LF headers.
  - [x] SEC-006 (Medium): broker accepts only verified loopback IP literals (.name branch removed).
  - [x] SEC-007 (Medium): duplicate approvalId denied fail-closed (was fail-open-by-hang).
  - [x] SEC-008 (Low): zero derived seed in provisionAndUnlock (defer resetBytes).
  - [x] SEC-009 (Low): withVaultKey re-arms auto-lock timer → activity-based idle.
- [x] DMG packaging (local tier) — `scripts/package-dmg.sh` builds Release ad-hoc .app → hdiutil drag-install .dmg. Verified: dist/AuthBox-0.1.0.dmg (1.7M) mounts with AuthBoxMac.app + /Applications symlink. dist/ gitignored.
- [ ] codesign (Developer ID) + notarize + staple — HITL: wired as the script's RELEASE tier (activates on AUTHBOX_DEV_ID + AUTHBOX_NOTARY_PROFILE env); needs Maurice's Apple Developer ID cert + notarytool profile + DEVELOPMENT_TEAM in project.yml
- [ ] optional later: Sparkle auto-update

### P6 — AI-Fleet integration (bonus, fixes the 2026-06-01 git-key-leak class)
- [ ] Broker client so gemini-proxy et al. request keys from broker instead of gemini-api-config.json
- [ ] Migrate AI-Fleet provider keys → broker; remove from git-tracked config (HITL: touches live proxy)

Gate per phase: pnpm typecheck && pnpm test (TS) + xcodebuild build/test (Swift) + UX-map manual evidence in notes.md.

## 2026-06-03 · Crypto Wallet Upgrade — Atomic Execution Queue

Goal: upgrade Auth Box into also a self-custodial multi-coin wallet (BTC + ETH
first), reusing the existing BIP-39 seed. Architecture: WALLET_ARCHITECTURE.md.

### Phase 0 — Architecture [DONE]
- [x] Ultra Think derivation/security model → WALLET_ARCHITECTURE.md
- [x] Decide: standard BIP-32/44/84 branch off existing BIP-39 seed; watch-only server; audited libs

### Phase 1 — Crypto foundation (offline, deterministic) [DONE]
- [x] Install @scure/bip32, @scure/btc-signer, @noble/curves, @scure/base
- [x] packages/crypto/src/wallet.ts: deriveAccount/deriveAddress/derivePrivateKey + BTC(segwit+legacy)/ETH/testnet/xpub
- [x] ethAddressFromPublicKey with EIP-55 checksum
- [x] wallet.test.ts: 14 tests incl. 3 external interop anchors (iancoleman vectors) — all green
- [x] export from packages/crypto index; tsc clean

### Phase 2 — Schema + shared types (watch-only) [DONE]
- [x] packages/shared/src/types/wallet.ts (Coin/BtcScriptType/WalletNetwork + WalletAccount/Address)
- [x] Zod schemas in validation/index.ts (enums parity with TS + Go)
- [x] migration 011_wallet_accounts (wallet_accounts + wallet_addresses, NUMERIC(40,0) for wei; no secret columns)
- [x] shared build clean; migration applied (version 11); tables verified

### Phase 3 — API (read / watch-only) [DONE]
- [x] Go domain + repo: WalletAccount/WalletAddress (domain/wallet.go + repository/pg/wallet_repo.go; NUMERIC via ::text/::numeric)
- [x] Go service + handler: account CRUD + addresses (create from xpub, list, delete) with enum validation → 400
- [x] Wallet enum-parity test (Go) — guards cross-layer drift (3 tests green)
- [x] Balance provider: BTC via mempool.space, ETH via publicnode RPC (watch-only, fixed trusted base URLs, SSRF-guarded)
- [x] GET /wallet/accounts/:id/balance returns confirmed/unconfirmed (real indexer call; live test proves real data)
- [x] Routes wired in main.go; go build + vet clean; go test ./... 43 passed / 9 packages
- [x] Full closed-loop e2e (scripts/wallet-e2e-test.mjs): SRP register→login→create→addresses→REAL balance (57 BTC)→delete, 14/14

### Phase 4 — Web UI [DONE]
- [x] apps/web lib/api.ts walletApi typed client (createAccount/list/delete/addAddress/listAddresses/balance); web tsc --noEmit clean
- [x] apps/web/(vault)/wallet/page.tsx: account list, receive address + safety chip, balance display (Vault Onyx design system)
- [x] client-side derivation via @authbox/crypto deriveAccount/deriveAddress from on-demand mnemonic; only xpub + address leave the device
- [x] nav entry to surface /wallet ((vault)/layout.tsx navItems)
- [x] visual verification: BTC + ETH accounts created live in browser; derived addrs match audited package + external BIP-84/EIP-55 anchors (PAGE_MAP.md Evidence; screenshots authbox-uxmap/13..19)

### Phase 5 — Transactions (HITL / testnet-first) [IN PROGRESS]

#### 5a — Crypto signing layer (offline, no broadcast = no fund movement) [DONE]
- [x] add micro-eth-signer@0.18.1 (paulmillr, audited, same @noble/@scure ecosystem) for EIP-1559 RLP
- [x] packages/crypto/src/wallet-tx.ts: buildBtcTransaction — selectUTXO coin-selection + change + fee (BIP-69), p2wpkh (+p2pkh via nonWitnessUtxo), derive per-input key → sign → zeroize in finally
- [x] wallet-tx.ts: buildEthTransaction — EIP-1559 prepare→signBy, recovered-sender == derived-address self-check, zeroize private key in finally
- [x] export from packages/crypto index.ts
- [x] wallet-tx.test.ts: 14 tests — ETH sender-recovery anchored to canonical 0x9858…Eda94 + hedged-signature invariant + BTC mainnet/testnet build+finalize + insufficient-funds/bound checks + key-hygiene; finding: @noble ETH sigs are hedged (non-deterministic, valid), @scure BTC sigs deterministic
- [x] tsc clean + full crypto vitest green (80/80) + build emit clean

#### 5b — Broadcast relay (server forwards, never signs) [QUEUED]
- [ ] Go: POST /wallet/broadcast {coin,network,rawTxHex} → mempool.space (BTC) / publicnode eth_sendRawTransaction (ETH); fixed trusted endpoints (SSRF-safe); returns txid
- [ ] enum/network validation → 400; Go test + live TESTNET broadcast proof (no mainnet)

#### 5c — Send UI + HITL gate [QUEUED]
- [ ] wallet page Send dialog: to / amount / fee-rate; build+sign client-side; show fee + total before confirm; testnet badge
- [ ] mainnet HITL gate: explicit double-confirm + network/amount warning before any mainnet broadcast
- [ ] 3-round visual polish + chrome-devtools screenshots

### Deferred companion
- [ ] WALLET_ARCHITECTURE.html (2份制 Chinese companion via html-style-router, Claude Warm Academic) — produce at a doc milestone

### Deferred companion
- [ ] WALLET_ARCHITECTURE.html (2份制 Chinese companion via html-style-router, Claude Warm Academic) — produce at a doc milestone
