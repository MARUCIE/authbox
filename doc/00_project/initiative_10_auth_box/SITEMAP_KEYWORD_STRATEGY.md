---
Title: SITEMAP_KEYWORD_STRATEGY - initiative_10_auth_box
Scope: project
Owner: ai-agent
Status: active
LastUpdated: 2026-02-11
Related:
  - /doc/00_project/initiative_10_auth_box/PRD.md
  - /doc/00_project/initiative_10_auth_box/USER_EXPERIENCE_MAP.md
  - /doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md
---

# 网站地图与关键词策略

## 目标
- 建立 Public 页面信息架构，承接搜索流量并导流到 Console onboarding。
- 将关键词策略与产品旅程打通，形成“SEO 漏斗 + 产品漏斗”双指标体系。

## 网站地图（规划）

### Public
- `/`
- `/product`
- `/features/platform-account-provisioning`
- `/features/credential-lifecycle`
- `/features/ai-assistant-governance`
- `/features/audit-hash-chain`
- `/use-cases/security-ops`
- `/use-cases/compliance-audit`
- `/use-cases/platform-admin`
- `/compare/hashicorp-vault-alternative`
- `/compare/doppler-alternative`
- `/compare/kong-konnect-alternative`
- `/pricing`
- `/security`
- `/docs`
- `/blog`
- `/changelog`
- `/contact`
- `/sitemap.xml`
- `/robots.txt`

### Console（已实现）
- `/platforms`
- `/accounts`
- `/credentials`
- `/assistants`
- `/audit`
- `/settings`

## 关键词策略

| Cluster | 主关键词 | 次关键词 | 落地页 |
|---|---|---|---|
| C1 授权治理 | API 授权管理平台 | API key 生命周期管理、授权轮换 | `/product` |
| C2 安全运维 | 凭据轮换审计 | 凭据吊销、密钥治理 | `/features/credential-lifecycle` |
| C3 合规审计 | 审计日志不可篡改 | 审计导出、hash chain audit | `/features/audit-hash-chain` |
| C4 AI 场景 | AI 助手权限治理 | LLM access governance、agent access control | `/features/ai-assistant-governance` |
| C5 竞品替代 | Vault 替代方案 | Doppler alternative、Kong alternative | `/compare/*` |

## 执行顺序
1. 上线 C1/C3/C4 对应页面。
2. 上线 compare 页面模板与 docs 内链。
3. 建立每月内容节奏（案例/合规更新/changelog）。

## 指标
- Organic sessions
- Landing -> Console CTA CTR
- `/platforms/new` 到达率
- 品牌词/非品牌词占比

