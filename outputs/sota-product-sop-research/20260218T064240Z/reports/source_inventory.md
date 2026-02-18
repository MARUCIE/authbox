# Source Inventory (Last 12 Months Window)

Window: 2025-02-18 to 2026-02-18 (UTC)

| # | Product/Platform | Source | Date in source | Why selected |
|---|---|---|---|---|
| 1 | OpenAI | https://openai.com/index/updating-our-preparedness-framework/ | 2025-04-15 | 明确给出风险分级、Safeguards、跨职能审议与部署门禁 |
| 2 | OpenAI | https://openai.com/safety/evaluations-hub/ | Last updated 2025-08-15 | 给出持续评测公开机制与评测类型（内容/JB/幻觉/层级指令） |
| 3 | Anthropic | https://www.anthropic.com/rsp-updates | Effective 2025-03-31 / 2025-05-14 / 2026-02-10 | 版本化 RSP + capability threshold 对应 Required Safeguards |
| 4 | Google DeepMind | https://deepmind.google/blog/updating-the-frontier-safety-framework/ | 2025-02-04 | CCL 分级 + deployment mitigation + safety case + governance approval |
| 5 | Google DeepMind | https://deepmind.google/blog/strengthening-our-frontier-safety-framework/ | 2025-09-22 | 扩展风险域（manipulation/misalignment）+ pre-launch safety case review |
| 6 | Microsoft | https://www.microsoft.com/en-us/security/blog/2025/04/21/securing-our-future-april-2025-progress-report-on-microsofts-secure-future-initiative/ | 2025-04-21 | Secure by Design 组织化落地、角色治理、量化进展 |
| 7 | Microsoft | https://www.microsoft.com/en-us/security/blog/2025/06/26/building-security-that-lasts-microsofts-journey-towards-durability-at-scale/ | 2025-06-26 | Durable security playbook（角色、流程、指标、复盘） |
| 8 | GitHub | https://github.blog/changelog/2025-03-24-enterprise-custom-properties-enterprise-rulesets-and-pull-request-merge-method-rule-are-all-now-generally-available/ | 2025-03-24 | 企业级 rulesets：PR 审查/Actions/推送保护/规则洞察 |
| 9 | GitLab | https://handbook.gitlab.com/handbook/product/product-processes/ | handbook 页面（检索元数据：近一周更新） | 双轨产品研发流程（Product/Eng/UX/Quality） |
| 10 | GitLab | https://handbook.gitlab.com/handbook/engineering/testing/ | handbook 页面（检索元数据：近两个月更新） | 明确质量门禁（pre-commit/MR pipeline/deploy/post-deploy） |
| 11 | GitLab | https://handbook.gitlab.com/handbook/engineering/workflow/ | handbook 页面（检索元数据：近一周更新） | 月度 release 节奏、code cut-off、error budget 输入 |
| 12 | Vercel | https://vercel.com/changelog/new-deployments-of-vulnerable-next-js-applications-are-now-blocked-by | 2025-12-05 | 平台级安全门禁（已知漏洞版本自动阻断部署） |
| 13 | Vercel | https://vercel.com/docs/checks/creating-checks | Last updated 2026-01-26 | Checks API 作为发布门禁（block domain assignment） |
| 14 | Vercel | https://vercel.com/changelog/unified-security-actions-dashboard | 2025-12-08 | 漏洞动作台+自动修复建议+人工 remediation 路径 |

## Key Evidence Excerpts (Traceability)

- OpenAI Preparedness (2025-04-15): High/Critical capability 分级，High must safeguard before deploy，Critical must safeguard during development；SAG 跨职能评审并建议领导决策。
- OpenAI Evaluations Hub (2025-08-15): 持续公开评测数据，覆盖 disallowed content / jailbreak / hallucination / instruction hierarchy。
- Anthropic RSP: 2025-03-31 引入/细化 capability thresholds 与 Required Safeguards；2025-05-14 更新 ASL-3 范围；2026-02-10 追加 AI R&D-4 threshold 说明与 sabotage risk report。
- DeepMind FSF (2025-02-04): deployment mitigations + safety case + corporate governance approval gate（GA only if approved）。
- DeepMind FSF (2025-09-22): pre-launch safety case reviews + holistic risk assessment + expanded risk domains.
- Microsoft SFI (2025-04-21): Secure by Design UX Toolkit（20 teams pilot, 22k rollout）, AI development dedicated security/safety reviews, quantified engineering/security KPIs.
- Microsoft Durability (2025-06-26): durability metric stack（drift/regression/self-healing/coverage）+ role/process/platform 三位一体。
- GitHub (2025-03-24): enterprise rulesets enforce code governance, require PR workflows/checks and provide rule insights.
- GitLab Handbook: dual-track product flow + timeline-driven release + quality gates across code→pipeline→deploy→post-deploy。
- Vercel (2025-12 to 2026-01): vulnerable deploy auto-block, checks as blocking gates, security action center + one-click remediation.
