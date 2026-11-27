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
- `@authbox/crypto` 的 `encoding.ts`（`toBase64`/`fromBase64`/`toHex`/`fromHex`）是唯一编解码实现，分块转换，从根入口和 `@authbox/crypto/encoding` 子路径导出（子路径让扩展弹窗保持懒加载 crypto 主体）。
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
