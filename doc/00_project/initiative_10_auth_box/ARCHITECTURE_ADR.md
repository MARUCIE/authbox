---
Title: Architecture ADR - initiative_10_auth_box
Scope: project
Owner: architecture-council
Status: active
LastUpdated: 2026-02-11
Related:
  - /doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md
  - /doc/00_project/initiative_10_auth_box/ARCHITECTURE_RISK_REGISTER.md
  - /doc/00_project/initiative_10_auth_box/PRD.md
---

# Architecture ADR

## ADR-001: 采用分层模块化单体（MVP 阶段）
- Status: Accepted
- Date: 2026-02-11

### Context
- 当前系统规模适合单进程部署，但已包含 Platform/Account/Credential/Assistant/Audit 多域能力。
- 未来将引入持久化与策略引擎，若无清晰分层容易导致职责耦合。

### Decision
- 保持模块化单体架构，不提前拆微服务。
- 明确五层分工：
  - L1 Presentation（Console）
  - L2 API Delivery（Router/Middleware/Handlers）
  - L3 Domain Model（实体与校验）
  - L4 Data Access（Repository 接口与实现）
  - L5 Platform Infra（DB/Redis/External APIs）

### Consequences
- 正向：交付速度快、部署简单、演进路径可控。
- 负向：若缺少接口隔离，后续拆分成本上升。

---

## ADR-002: 安全基线前移到请求入口
- Status: Accepted
- Date: 2026-02-11

### Context
- 现有 API 路由已覆盖核心业务，但认证鉴权与策略校验仍未前置统一化。
- 审计事件存在，但仍需提升不可抵赖性与行为归因能力。

### Decision
- 在 middleware 层引入统一 AuthN/AuthZ 验证入口。
- 对高风险动作（credential rotate/revoke、assistant bind、audit export）强制策略校验。
- 审计记录要求包含 actor/source/decision 字段并规划 hash-chain 持久化。

### Consequences
- 正向：降低越权与追责失败风险。
- 负向：接入链路复杂度提升，需要配套测试与可观测能力。

---

## ADR-003: 可靠性与可观测性按 SLO 驱动
- Status: Accepted
- Date: 2026-02-11

### Context
- 当前已有 request timeout、recover、request_id 与结构化日志。
- 仍缺少 readiness、统一 metrics/traces、告警阈值与容量预算。

### Decision
- 建立 MVP-1 可靠性目标：
  - 可用性 99.5%
  - API p95 < 300ms
  - 5xx < 1%
- 建立 MVP-2 目标：
  - 可用性 99.9%
  - API p95 < 250ms
  - 5xx < 0.5%
- 新增 `/ready` 与依赖健康探测，接入 metrics/traces/alerts。

### Consequences
- 正向：故障检测与容量规划可量化。
- 负向：需要额外工程投入（监控、压测、告警治理）。

---

## ADR-004: 字节编解码只有一个实现，应用只经由包的 dist 使用 workspace 包
- Status: Accepted
- Date: 2026-11-27

### Context
- base64 在 web 和扩展里有 5 份手写副本，hex 在 crypto 内部有 2 份。手写副本都用 `String.fromCharCode(...bytes)`，blob 超过约 125 KB 时抛 `RangeError`。
- web 和扩展用 tsconfig `paths` 直接编译 `packages/*/src`，绕过了包的 `exports`；同一个包在 Node、vitest、Next、Vite 下解析到不同文件。

### Decision
- `@authbox/crypto` 的 `encoding.ts`（`toBase64`/`fromBase64`/`toHex`/`fromHex`）是唯一编解码实现，分块转换，从根入口导出。
- 删除所有应用层和包内副本；删除 tsconfig 中指向 `packages/*/src` 的 `paths`。应用只经由 `exports` 解析到 `dist`，turbo 的 `build`/`typecheck`/`dev` 都依赖 `^build`。
- 编码输出与旧实现逐字节一致（测试对 256 个字节值与 Node `Buffer` 对拍），存储格式不变。

### Consequences
- 正向：大 blob 不再崩溃；包在所有运行时解析到同一份产物；改编解码只改一处。
- 负向：直接跑单个应用的 dev/typecheck 前需先构建 packages（turbo 自动完成）。
- 守门：`scripts/check-architecture.mjs` 禁止新增本地编解码和指向 src 的 paths（第 6 批落地）。

---

## ADR-005: API 响应格式由 internal/httpx 唯一拥有
- Status: Accepted
- Date: 2026-11-27

### Context
- 错误信封 `{error, code}` 有 4 个写法：handler 的 writeError，以及 auth 中间件、限流器、安全中间件里手写的 JSON 字符串。后两者用 `http.Error`，响应头是 `text/plain`。
- 500 的错误码同时存在 `INTERNAL` 和 `INTERNAL_ERROR`；未授权提示有 3 种写法；未找到既用 `nil, nil` 又用哨兵错误表示。

### Decision
- 新建无内部依赖的 `internal/httpx`：`WriteJSON`、`WriteError`、错误码常量。所有层只经它写响应。
- handler 的请求边界收敛到 `request.go`：`requireUser`、`uuidParam`、`decodeJSON`、`writeInternal`。
- 服务层 `Get*` 把仓储的 `nil, nil` 转为 `domain.Err*NotFound`；每个领域一个错误映射函数，保留原有的 400/404/409 文案。

### 对外契约的变化（均为收敛，已核对无客户端依赖）
- auth/安全中间件的 401/415 响应头从 `text/plain` 改为 `application/json`，响应体字节不变。
- 4 个端点（会话列表、撤销会话、撤销全部会话、TOTP 状态）的 500 错误码由 `INTERNAL` 改为 `INTERNAL_ERROR`，与其余端点一致。web、扩展、iOS、macOS 均不读取 `code`。
- 鉴权失败兜底文案统一为 `unauthorized`（该分支在 auth 中间件之后不可达）。

### Consequences
- 正向：改错误格式只改一处；客户端可以按 `Content-Type` 一致地解析所有错误。
- 守门：`internal/archtest` 检查 httpx 不依赖其他内部包、只有 httpx 编码响应（第 6 批落地）。

---

## ADR-006: Go API 的客户端、线格式类型和 SRP 登录握手归 @authbox/api-client
- Status: Accepted
- Date: 2026-11-27

### Context
- web 有 684 行的类型化客户端；扩展用裸 `fetch` 调同样的端点，自带分页循环。
- SRP 登录握手（A → 盐和 B → 派生密钥 → M1 → 校验 M2）在 web 和扩展弹窗各有一份。这是安全关键流程，两份副本只能靠人工保持一致。
- `@authbox/shared` 里还有一套没人用的线格式类型，其中 `EncryptedVaultItem.revision` 与 API 实际字段 `version` 不符；扩展信了它，缓存项的 `revision` 一直是 `undefined`。

### Decision
- 新包 `@authbox/api-client`：`createApiClient(resolveBase)`、`ApiError`、各端点及其线格式类型、`collectPages`。入口不依赖 crypto。
- 子入口 `@authbox/api-client/login` 提供 `srpLogin`，含 M2 校验和响应完整性检查；扩展弹窗按需动态加载它。
- 各应用只保留自己的 base URL 策略（`apps/web/lib/api.ts`、`apps/extension/src/lib/api.ts`）。
- 删除 shared 中未用且有误的线格式类型；shared 只保留领域模型（解密后的条目、agent 策略、凭据目录）。

### Consequences
- 正向：协议改动只改一处；扩展与 web 的登录行为一致；扩展弹窗的加密代码块从 228 KB 降到 94 KB（按需加载的模块可以被 tree-shake）。
- 行为变化：扩展登录现在也要求完成登录的响应包含完整的 vault 凭据（与 web 一致，服务端一直返回这些字段）；缓存项的 `revision` 取 API 的 `version`。
- 守门：`scripts/check-architecture.mjs` 禁止应用直接 `fetch` Go API 路径（第 6 批落地）。

---

## ADR-007: 架构规则写成会失败的检查，并在每个 PR 上运行
- Status: Accepted
- Date: 2026-11-27

### Context
- 第 1–5 批收敛的边界（一个编解码、一个响应包、一个 API 客户端、依赖方向）只靠文档和自觉维持，下一次改动就可能重新长出副本。
- 原有 CI 只在合并到 main 的 PR 上触发，而且不构建、不测试 packages、web 和扩展；叠加 PR 完全没有检查。

### Decision
- Go：`services/api/internal/archtest`（只有测试文件，随 `go test ./...` 运行）
  - 每个内部包有一张允许导入的白名单；名单之外的导入、或没有登记的新包，都会失败。`cmd/api` 是组装根，不受限。
  - 只有 `internal/httpx` 能编码响应：其他文件不能调用 `json.NewEncoder`、`http.Error`；handler 和 middleware 不能用 `fmt.Fprint*` 写响应。
- TypeScript：`scripts/check-architecture.mjs`
  - 不允许应用互相导入，不允许包导入应用，不允许用相对路径伸进别的包。
  - 只能通过包的 `exports` 导入；`packages/*/src` 里不能有编译产物；tsconfig 不能用 `paths` 指向 `packages/*/src`。
  - base64/hex 只在 `packages/crypto/src/encoding.ts` 实现。
  - Go API 的 base URL 和 `/api/v1` 路径只出现在 api-client 和两个应用的配置文件里。
- 两套规则都带自测：把违规样例喂给规则，确认每条都会报错，避免"永远不触发"的假检查。
- `.github/workflows/ci.yml`：每个 PR（任何目标分支）和推送到 main 时运行架构规则、pnpm 构建/类型检查/测试（packages、web、扩展）、`go vet`/`go test`、真实 Postgres 上的仓储集成测试和全链路 e2e。

### Consequences
- 正向：回退到旧写法会在 CI 里直接失败，并指出该放到哪个模块。
- 范围：apps/console 不在检查范围（独立 lockfile，待定 P-02）；钱包 e2e 依赖公共区块索引服务，不进 CI。
- 新增包时要在 `allowedImports` 登记，这是有意的：新包的层级需要一次明确决定。
