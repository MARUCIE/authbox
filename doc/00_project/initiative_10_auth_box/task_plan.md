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

## 当前状态

- 所有 MVP 功能阶段已完成（Phase 0-4 + Gap Fixes + UX Round 1-2 + Round 3-11）
- 构建通过：7/7 packages (incl. video), 16 pages, 0 errors
- 最新验证基线：`make test-api` PASS + `make test-crypto` PASS（51 deterministic + 2 live skipped） + `scripts/e2e-test.mjs http://localhost:8080` 65/65 PASS
- Follow-up drift cleanup: README / UX baseline synced to 2026-03-22 reality, `_headers` no longer allows `*.trycloudflare.com`, runtime scan shows no temporary tunnel dependency outside historical docs
- Release readiness checkpoint (2026-03-22): `authbox.io` public routes (`/`, `/login`, `/register`, `/create`, `/unlock`, `/settings`, `/manifest.webmanifest`) return 200 with security headers, but public API health is not proven (`/health` on authbox.io = 404; `api.authbox.io` unresolved)
- Project gate checkpoint (2026-03-22): `ai check --json --no-sbom --base-dir /Users/mauricewen/Projects/10-auth-box` PASS (`outputs/check/20260322-021252-a7b35035`); patched `scripts/release_gate.sh` now reuses the same project-scoped gate and passes on current worktree (`outputs/release-gate/20260322T021557Z/`)
- Three-end consistency is currently BLOCKED: local committed HEAD and `origin/main` both at `97336bf`, while `vps-prod:/root/10-auth-box` is `850c226` and dirty (`?? docker-compose.vps-local.yml`); VPS `localhost:4010/health` refused connection
- Release gate cannot represent the current fixes until they are committed; existing `release-gate` / `risk-classify` scripts only evaluate committed ref ranges
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

---

Maurice | maurice_wen@proton.me

## Changelog
- 2026-03-22: 新增 release readiness checkpoint、三端一致性阻塞项与项目级 `ai check` 兼容收口任务。（原因：release readiness hardening）
