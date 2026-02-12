---
Title: Architecture Risk Register - initiative_10_auth_box
Scope: project
Owner: architecture-council
Status: active
LastUpdated: 2026-02-11
Related:
  - /doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md
  - /doc/00_project/initiative_10_auth_box/ARCHITECTURE_ADR.md
  - /doc/00_project/initiative_10_auth_box/PLATFORM_OPTIMIZATION_PLAN.md
---

# Architecture Risk Register

## 风险分级口径
- Probability: Low / Medium / High
- Impact: Medium / High / Critical
- Status: Open / Mitigating / Accepted / Closed

## 风险清单（Architecture Council 2026-02-11）

| ID | Category | Risk | Trigger | Probability | Impact | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| ARC-SEC-01 | Security | API 缺少统一 AuthN/AuthZ 入口，存在越权调用风险 | 请求未携带身份仍可命中业务 handler | High | Critical | 在 middleware 层新增认证与 RBAC 校验；高风险动作强制策略引擎判定 | Security Lead | Closed |
| ARC-SEC-02 | Security | 审计事件缺少不可抵赖链路，事后追责可信度不足 | 审计记录未包含 actor/source/prev_hash | High | High | 审计持久化改为 append-only + hash chain；导出校验签名 | Security Lead | Closed |
| ARC-SEC-03 | Security | 配置与密钥管理仍有静态默认值，存在泄露扩散风险 | 共用环境沿用开发默认凭据 | Medium | High | 统一改为 secrets manager 或环境注入，移除共享环境静态默认凭据 | Security Lead | Mitigating |
| ARC-SRE-01 | Reliability | 缺少 readiness 与依赖健康探测，故障切换慢 | 下游依赖异常但 `/health` 仍返回 200 | Medium | High | 新增 `/ready` 并校验 Postgres/Redis；容器探针切换到 readiness | SRE Lead | Open |
| ARC-SRE-02 | Reliability | 未建立 SLO/告警阈值，性能回归难以及时发现 | p95、5xx 变化无自动告警 | Medium | High | 建立 MVP-1/MVP-2 SLO，接入 metrics/traces，配置告警规则 | SRE Lead | Open |
| ARC-SRE-03 | Capacity | Provider 调用无分级限流与重试预算，突发流量下稳定性不足 | 突发请求或上游抖动导致排队/超时放大 | Medium | High | 按路由分级限流、超时、重试预算与熔断策略 | SRE Lead | Open |
| ARC-ARCH-01 | Architecture | 领域边界未通过接口固化，后续拆分成本升高 | handler 直接依赖内存实现而非接口 | Medium | Medium | repository 接口化与依赖反转，按域封装 service facade | Architect | Mitigating |
| ARC-ARCH-02 | Architecture | 文档与实现可能再次漂移，入口一致性回归 | 新增路由未同步 API 契约与 UX Map | Medium | High | 建立“代码+文档同 run 变更”守门，发布前执行一致性扫描 SOP | Architect | Open |

## 优先级与处理顺序
1. ARC-SRE-01
2. ARC-SRE-02
3. ARC-ARCH-02
4. ARC-SEC-03
5. ARC-ARCH-01

## 追踪证据
- Council 报告：`outputs/architecture-council-adr/20260211T145910Z/reports/council_consensus.md`
- Security 视角：`outputs/architecture-council-adr/20260211T145910Z/reports/security_threat_model.md`
- SRE 视角：`outputs/architecture-council-adr/20260211T145910Z/reports/sre_reliability_capacity.md`
- Architect 视角：`outputs/architecture-council-adr/20260211T145910Z/reports/architect_view.md`
- 实施验证：`outputs/security-entry-audit-chain/20260211T150834Z/logs/runtime_security_flow_retry2.log`
- 契约与鉴权闭环验证：`outputs/api-contract-auth-sync/20260211T154715Z/reports/api_contract_auth_sync_report.md`
