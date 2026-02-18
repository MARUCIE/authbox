# SOTA Product/Platform SOP Benchmark Matrix

## Matrix

| Platform | SOP Core Flow (abstracted) | Role Model | Quality Gates | Metrics / Signals | Notes for Transfer |
|---|---|---|---|---|---|
| OpenAI | Risk identification -> capability leveling -> safeguards design -> SAG review -> leadership deploy decision -> post-release eval disclosure | Safety researchers + cross-functional SAG + leadership | High/Critical thresholds; safeguards mandatory before deploy/dev; residual risk review | Eval coverage, capability threshold crossings, safeguards report completeness | 适合高风险功能/模型发布；可迁移为“风险等级驱动发布” |
| Anthropic | Versioned policy -> threshold update -> required safeguards mapping -> model-specific risk reports -> policy revision | Policy owners + safety + security + governance | Capability thresholds trigger stronger safeguards (ASL-3 etc.) | Threshold status, safeguard readiness, policy version compliance | 适合“政策即流程”团队；强调版本化治理 |
| Google DeepMind | CCL assessment -> security level mapping -> mitigation iteration -> safety case -> governance approval -> controlled launch -> continuous update | Safety research + security + governance body | Safety case approval is GA gate; pre-launch safety case review; deployment mitigations | Risk acceptability determination, mitigation maturity, CCL coverage | 适合“高不确定性高影响”场景 |
| Microsoft (SFI) | Secure-by-design enablement -> org-wide governance -> pillar execution -> KPI dashboard -> durability review loop | Deputy CISO network + Eng/Ops/Sec shared ownership | Dedicated security/safety reviews in AI dev; policy/tooling enforcement in pipelines | MFA %, asset inventory %, pipeline inventory %, detection counts, vulnerability MTTM | 适合企业级平台治理和规模化执行 |
| GitHub Enterprise | Metadata governance -> enterprise rulesets -> PR/review/workflow enforcement -> rule insights feedback | Enterprise admins + repo maintainers + contributors | Required workflows/checks, push protection, merge method constraints | Rule insights, bypass visibility, policy coverage | 适合多仓库统一治理 |
| GitLab | Dual-track product flow -> milestone/release timeline -> quality gates in testing/deploy -> post-deploy validation | Product/UX/Dev/Quality | Pre-commit/pre-receive, MR pipeline+mandatory review, deployment pipeline, post-deploy monitoring | Error budget input, release cadence adherence, regression detection | 适合“产品+工程+质量”一体化流程 |
| Vercel | Build/deploy checks -> blocking gate before domain assignment -> vulnerability auto-detection -> remediation workflow | Platform security + project owners + integrations | Vulnerable version auto-fail; blocking checks; security action dashboard | Blocked deployment count, check pass rate, remediation SLA | 适合平台侧“默认安全门禁” |

## Cross-Platform Convergence (Observed)

1. 风险分级先行：先做 capability/risk 分级，再触发不同级别门禁。
2. 门禁从“建议”升级到“硬阻断”：MR/CI/CD/Deploy 阶段逐层阻断。
3. 角色从单点审批转向跨职能治理：Safety/Security/Eng/Product/Governance 联合决策。
4. 指标从“通过率”扩展到“耐久性”：drift、regression、coverage、MTTM、error budget。
5. 发布后持续公开与反馈：hub/scorecard/changelog/report 持续迭代，不是一次性验收。

## Differential Signals (Where leaders differ)

- Frontier AI labs（OpenAI/Anthropic/DeepMind）把“安全 case + capability threshold”作为主干流程。
- Dev platform（GitHub/GitLab/Vercel）把“rulesets/checks/pipelines”作为主干流程。
- Microsoft 把组织治理（roles/ownership/review cadence）做成与技术门禁同级别的控制面。
