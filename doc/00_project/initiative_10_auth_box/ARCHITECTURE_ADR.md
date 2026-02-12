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
