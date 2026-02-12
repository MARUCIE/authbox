# PM 角色输出：竞品分析 + PRD 增量建议

## 竞品分析（按能力象限）

| 象限 | 代表产品（参考类别） | 优势 | 短板 | 对 Auth Box 的启发 |
|---|---|---|---|---|
| Secret 管理 | HashiCorp Vault、Doppler、Infisical | 凭据安全与密钥生命周期成熟 | 业务接入旅程与 AI 助手场景不闭环 | 保持安全基线，同时补齐「账号-授权-AI 助手」业务闭环 |
| API 网关治理 | Kong Konnect、Apigee | API 策略与流量治理强 | 平台账号创建与授权运营弱 | 将网关策略能力映射到“授权策略与审计导出” |
| AI 访问层 | Portkey/LLM Gateway 类方案 | 模型调用可观测、配额与路由灵活 | 通常缺少企业级凭据主数据治理 | 把 AI gateway 纳入“合规审计链 + 凭据治理” |
| IAM/SSO 平台 | Okta/Auth0 类 | 身份体系与组织权限成熟 | API 凭据生命周期与多平台接入流程偏弱 | 不做通用 IAM，聚焦 API 授权治理细分场景 |

## PRD 增量建议

1. 价值主张升级：
- 从“授权管理工具”升级为“API 授权治理中台（AI 场景优先）”。

2. MVP-1.5 目标：
- 增加“合规可解释输出”：每次高风险动作返回策略依据摘要。
- 增加“场景模板”：平台接入模板（OpenAI/Anthropic/Azure OpenAI）。

3. 验收指标补充：
- SEO 入口转化：Landing -> `/platforms/new` 点击率。
- Journey 完成率：A->B->C->D 漏斗转化率。

4. 竞品对标页策略：
- 新增 compare 页面模板，明确差异化：
  - Auth Box = 授权生命周期 + 审计链 + AI 接入治理。
