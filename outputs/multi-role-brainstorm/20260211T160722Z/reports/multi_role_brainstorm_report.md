# 多角色头脑风暴 SOP 报告

## Run
- SOP ID: `multi-role-brainstorm`
- Run ID: `20260211T160722Z`
- Evidence Root: `outputs/multi-role-brainstorm/20260211T160722Z`

## 结构化预检
- 架构来源：`doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md`
- 路由来源：`apps/console/lib/routes.ts`、`apps/console/app/page.tsx`
- 结论：当前仅覆盖 Console 任务流，缺少 Public sitemap 与 SEO 前置旅程。

## 角色输出
- PM：`reports/pm_competitive_prd_brainstorm.md`
- 设计：`reports/designer_uxmap_brainstorm.md`
- SEO：`reports/seo_sitemap_keyword_strategy.md`
- 冲突收敛：`reports/council_conflicts_decisions.md`

## 决策
1. 新增 Public 信息架构并文档先行，避免“先做页面后补规范”。
2. 新增 UX Journey P0/P1（SEO 入口 -> onboarding）。
3. 建立单一 sitemap/关键词规范文档，作为增长入口事实源。
4. 指标采用双漏斗：SEO 转化 + 产品 Journey 完成率。

## 文档回写
- `doc/00_project/initiative_10_auth_box/PRD.md`
- `doc/00_project/initiative_10_auth_box/USER_EXPERIENCE_MAP.md`
- `doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md`
- `doc/00_project/initiative_10_auth_box/PLATFORM_OPTIMIZATION_PLAN.md`
- `doc/00_project/initiative_10_auth_box/SITEMAP_KEYWORD_STRATEGY.md`（新增）
- `doc/00_project/initiative_10_auth_box/task_plan.md`
- `doc/00_project/initiative_10_auth_box/notes.md`
- `doc/00_project/initiative_10_auth_box/deliverable.md`
- `doc/00_project/initiative_10_auth_box/ROLLING_REQUIREMENTS_AND_PROMPTS.md`
- `doc/index.md`
- `doc/00_project/initiative_10_auth_box/index.md`

## 继续执行（Public 页面落地）
- 新增页面与入口：
  - `/product`
  - `/features/[slug]`
  - `/use-cases/[slug]`
  - `/compare/[slug]`
  - `/pricing`、`/security`、`/docs`、`/blog`、`/changelog`、`/contact`
- 新增元数据端点：
  - `/sitemap.xml`（`apps/console/app/sitemap.ts`）
  - `/robots.txt`（`apps/console/app/robots.ts`）
- 复用资产：
  - `apps/console/lib/marketing.ts`
  - `apps/console/components/marketing-page.tsx`

## 继续执行（CTA 埋点与双漏斗聚合）
- 新增 telemetry API：
  - `POST /api/telemetry/public-events`
  - `GET /api/telemetry/public-funnel`
- 新增 telemetry 资产：
  - `apps/console/lib/public-telemetry-events.ts`
  - `apps/console/lib/public-telemetry-store.ts`
  - `apps/console/lib/public-telemetry-client.ts`
  - `apps/console/components/public-event-tracker.tsx`
- 页面接入：
  - Public 页面：`PUBLIC_PAGE_VIEW`、`PUBLIC_CTA_CLICK`、`PUBLIC_COMPARE_CLICK`
  - Console onboarding：`ONBOARDING_ENTRY_VIEW`、`PLATFORM_CREATE_SUCCESS`
- smoke 证据：
  - `reports/public_funnel_before.json`
  - `reports/public_event_post_page_view.json`
  - `reports/public_event_post_cta.json`
  - `reports/public_funnel_after.json`

## 继续执行（双漏斗持久化与看板）
- 新增持久化：
  - `AUTH_BOX_CONSOLE_TELEMETRY_FILE`
  - ndjson 落盘 + 启动回放恢复
- 新增看板入口：
  - `/metrics/funnel`
- 重启一致性证据：
  - `reports/persistence/funnel_before_restart.json`
  - `reports/persistence/funnel_after_restart.json`
  - `reports/persistence/persistence_assertion.txt`

## 继续执行（双漏斗过滤与趋势）
- `public-funnel` 支持参数：
  - `window_minutes` / `bucket_minutes` / `recent_limit`
  - `source` / `persona` / `route`
- 返回增强：
  - `query`（生效参数）
  - `event_count`
  - `trend`（按 bucket 聚合）
- 看板升级：
  - `/metrics/funnel` 新增过滤表单与趋势面板
- 断言证据：
  - `reports/filter_trend/funnel_beta_30m.json`
  - `reports/filter_trend/funnel_alpha_30m.json`
  - `reports/filter_trend/filter_trend_assertion.txt`

## 继续执行（双漏斗分租户与阈值告警）
- `public-funnel` 能力增强：
  - 新增查询参数：`tenant_id`
  - 新增返回字段：`top_tenants`、`alerts`
- 采集链路增强：
  - `public-events` 请求体支持 `tenant_id`
  - public 页面与 onboarding 链路透传 `tenant_id`
- 看板升级：
  - `/metrics/funnel` 新增 Tenant 过滤输入、Top Tenants 面板、Alerts 面板
- 断言证据：
  - `reports/tenant_alert/funnel_all_180m.json`
  - `reports/tenant_alert/funnel_beta_180m.json`
  - `reports/tenant_alert/funnel_alpha_180m.json`
  - `reports/tenant_alert/tenant_alert_assertion.txt`

## 验证
- `npm --prefix apps/console run build` PASS：
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/console_build_public_routes.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/console_build_dual_funnel.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/console_build_funnel_persistence.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/console_build_funnel_filters_trend.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/console_build_tenant_alerts.log`（首次失败，已定位并修复）
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/console_build_tenant_alerts_fix.log`
- `ai check` PASS：
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check_after_public_routes.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check_final_after_continue.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check_after_dual_funnel.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check_final_after_dual_funnel_docs.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check_after_persistence_dashboard.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check_final_after_persistence_report_update.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check_after_filter_trend_docs.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check_final_after_filter_trend_closeout.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check_after_tenant_alerts.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check_final_after_tenant_alert_docs.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check_final_post_reporting.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check_final_post_reporting_2.log`

## 风险与后续
- `agent-teams` 与 `onecontext` 在当前环境不可用，已走手工 Council fallback。
- `brainstorming` skill 在当前环境未注册，已走设计后直接实现 + smoke fallback。
- 待补齐项：历史趋势可视化图表与告警订阅通道（邮件/Webhook）。
