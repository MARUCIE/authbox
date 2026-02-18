---
Title: ROLLING_REQUIREMENTS_AND_PROMPTS - initiative_10_auth_box
Scope: project
Owner: ai-agent
Status: active
LastUpdated: 2026-02-13
---

# 滚动需求与提示词

## 需求台账

| 编号 | 日期 | 需求 | 状态 | 备注 |
|---|---|---|---|---|
| REQ-20260129-001 | 2026-01-29 | 建立接口授权管理平台：自动创建多平台账号并统一管理 AI 助手接入授权 | 计划中 | 初始需求基线 |
| REQ-20260129-002 | 2026-01-29 | SOP 一键全量交付（长任务）并保留证据 | 计划中 | 需在任务闭环验证 |
| REQ-20260129-003 | 2026-01-29 | 确定技术栈：Go + Next.js + PostgreSQL + Redis + OpenAPI + KMS + 对象存储 + Docker Compose | 已确认 | 技术栈基线 |
| REQ-20260129-004 | 2026-01-29 | 交付最小可运行骨架（API/Console/DB/Compose） | 进行中 | MVP-0 |
| REQ-20260129-005 | 2026-01-29 | 定义错误码与审计事件字典并保持 API 一致性 | 进行中 | 契约稳定性 |
| REQ-20260129-006 | 2026-01-29 | 定义迁移策略与数据保留策略（审计/导出/凭据） | 进行中 | 合规与成本 |
| REQ-20260129-007 | 2026-01-29 | 融入调研文档核心概念模型（7 个对象、4 级接管、5 条 AI 原则） | 已完成 | 来自 ai_master_control_prd.html |
| REQ-20260129-008 | 2026-01-29 | 补充安全基线与连接器开发规范 | 已完成 | 来自调研文档 |
| REQ-20260211-009 | 2026-02-11 | 落地统一 AuthN/AuthZ 入口与高风险动作 RBAC 门禁 | 已完成 | ARC-SEC-01 落地（MVP-1） |
| REQ-20260211-010 | 2026-02-11 | 审计事件补齐 actor/source/decision + hash-chain | 已完成 | ARC-SEC-02 落地（MVP-1） |
| REQ-20260211-011 | 2026-02-11 | 真实 API fixtures 采样与 replay/regression 回放机制 | 已完成 | real-api-fixtures-replay SOP |
| REQ-20260211-012 | 2026-02-11 | 功能闭环完整实现检查（entry/system/contract/verification） | 已完成 | full-loop-closure-check SOP |
| REQ-20260211-013 | 2026-02-11 | API 契约与鉴权同步：role 白名单、source 透传、权限矩阵契约测试 | 已完成 | api-contract-auth-sync SOP |
| REQ-20260211-014 | 2026-02-11 | 多角色头脑风暴：竞品分析+UX Map+sitemap/关键词策略并形成决策收敛 | 已完成 | multi-role-brainstorm SOP |
| REQ-20260211-015 | 2026-02-11 | Public SEO 路由与入口落地：实现 marketing 页面、sitemap/robots，并与 PDCA 文档同步 | 已完成 | multi-role-brainstorm 继续执行 |
| REQ-20260211-016 | 2026-02-11 | Public CTA 与双漏斗最小埋点：事件采集 + funnel 聚合接口 + onboarding 转化记录 | 已完成 | multi-role-brainstorm 继续执行（telemetry） |
| REQ-20260211-017 | 2026-02-11 | 双漏斗持久化与可视化：重启后不丢计数 + `/metrics/funnel` 看板 | 已完成 | multi-role-brainstorm 继续执行（persistence+dashboard） |
| REQ-20260211-018 | 2026-02-11 | 双漏斗过滤与趋势：支持窗口/来源/角色/路由过滤与 bucket 趋势 | 已完成 | multi-role-brainstorm 继续执行（filter+trend） |
| REQ-20260211-019 | 2026-02-11 | 双漏斗分租户与阈值告警：支持 `tenant_id` 聚合过滤并输出 alerts | 已完成 | multi-role-brainstorm 继续执行（tenant+alerts） |
| REQ-20260212-020 | 2026-02-12 | 一键全量交付（长任务）：执行 plan-first/ralph-loop/round1-round2/task-closeout 全链路验收 | 已完成 | one-click-full-delivery SOP |
| REQ-20260212-021 | 2026-02-12 | 一键全量交付复跑：在最新代码基线复核 Round1/Round2 与前后端专项门禁 | 已完成 | one-click-full-delivery Run `20260212T032220Z` |
| REQ-20260212-022 | 2026-02-12 | 队列执行规范固化（底层规范） | 已完成 | 将“队列执行/继续/go”写入 AGENTS/CLAUDE/CODEX/GEMINI；并复跑 full-loop-check（run_id=20260212T112402Z）留证据 |
| REQ-20260213-023 | 2026-02-13 | SOP 4.1 项目级全链路回归复跑：在当前基线复核 UX Map Round 2 + real API replay + contract loop + ai check | 已完成 | project-regression Run `outputs/project-regression/20260213T021241Z` |

## 提示词台账

| 编号 | 日期 | 提示词 | 用途 | 备注 |
|---|---|---|---|---|
| PROMPT-20260129-001 | 2026-01-29 | 新项目：接口授权管理平台，要求 planning-with-files + ralph loop + ai check + UX Map | 任务启动 | 来自用户指令 |
| PROMPT-20260129-002 | 2026-01-29 | 根据调研文档优化设计：SOP 一键全量交付（长任务），要求 planning-with-files + ralph loop + ai check + UX Map + Task Closeout | 任务优化 | 来自用户指令 |
| PROMPT-20260211-003 | 2026-02-11 | SOP：多角色头脑风暴（PM/设计/SEO），要求 planning-with-files + 冲突收敛 + 文档回写 | 任务优化 | 来自用户指令 |
| PROMPT-20260211-004 | 2026-02-11 | 继续：将多角色脑暴产物落地为 Public 页面与 sitemap/robots，并完成证据化收尾 | 任务实现 | 来自用户“继续”指令 |
| PROMPT-20260211-005 | 2026-02-11 | 继续：落地 telemetry 持久化与漏斗看板，并提供重启前后一致性证据 | 任务实现 | 来自用户“继续”指令 |
| PROMPT-20260211-006 | 2026-02-11 | 继续：落地漏斗过滤与趋势，并提供参数化查询与断言证据 | 任务实现 | 来自用户“继续”指令 |
| PROMPT-20260211-007 | 2026-02-11 | 继续：落地租户维度与阈值告警，补齐 API/看板/断言证据与文档回写 | 任务实现 | 来自用户“继续”指令 |
| PROMPT-20260212-008 | 2026-02-12 | SOP：一键全量交付（长任务），要求 planning-with-files + ralph loop + ai check + UX Map + Task Closeout | 任务验收 | 来自用户指令 |
| PROMPT-20260212-009 | 2026-02-12 | SOP：一键全量交付（长任务）再次执行，要求 planning-with-files + ralph-loop + ai check + UX Map + Task Closeout | 任务验收 | 来自用户“继续/一键全量交付”指令 |
| PROMPT-20260213-010 | 2026-02-13 | 继续/go（队列执行）：SOP 4.1 项目级全链路回归复跑（UX Map + E2E + ai check） | 任务验收 | 来自用户“继续/go/队列执行”指令 |

| PROMPT-20260213-011 | 2026-02-13 | 继续（队列执行）：SOP 5.2 发布治理 + SOP 5.3 postmortem 守门（含本地 gate） | 发布守门 | 来自用户“继续”指令 |## 防回归 Q&A

| 编号 | 日期 | 问题 | 根因 | 修复 | 预防 | 引用 |
|---|---|---|---|---|---|---|
| QA-20260129-001 | 2026-01-29 | 如何确保长任务不丢失目标与证据？ | 任务跨度大导致上下文漂移 | 使用 planning-with-files 三文件外置记忆 | 关键决策前重读 task_plan 并记录证据 | task_plan.md / notes.md |
| QA-20260129-002 | 2026-01-29 | 如何融入外部调研文档的设计优化？ | 调研文档格式/结构与项目文档不一致 | 提取核心概念模型、原则、规范，按 PDCA 口径更新四文档 | 保持 PDCA 四文档口径一致；记录来源 | PRD.md / SYSTEM_ARCHITECTURE.md |
| QA-20260129-003 | 2026-01-29 | AI 助手如何受控执行？ | AI 可能越权执行高风险动作 | 引入策略引擎（OPA）+ 接管程度刻度 + 工具白名单 | 工具调用必经策略裁决；高风险需确认 | PLATFORM_OPTIMIZATION_PLAN.md |
| QA-20260211-004 | 2026-02-11 | 如何防止高风险 API（rotate/revoke/bind/export）被错误角色调用？ | 路由层缺少统一 RBAC 门禁 | 在 `/api/v1/*` 入口统一 AuthN，并对高风险动作强制 `requireAnyRole` | 把角色门禁固化在路由注册层；拒绝事件写审计链 | `services/api/internal/server/server.go` / `services/api/internal/server/auth_middleware.go` |
| QA-20260211-005 | 2026-02-11 | 如何让审计日志具备不可抵赖链路？ | 事件缺少 actor/source/链路哈希 | 引入 append-only hash-chain（`event_hash` + `prev_event_hash`） | 每条事件记录 inputs/outputs hash，发布前跑链路校验 | `services/api/internal/repository/audit.go` / `outputs/security-entry-audit-chain/20260211T150834Z/reports/audit_events.json` |
| QA-20260211-006 | 2026-02-11 | 如何保证回归验证不是 mock 而是可复现真实 API？ | 测试样例与真实请求响应脱节，回归可信度不足 | 用真实 API 执行 core flow，沉淀 request/response/status fixtures，并强制 replay 通过 | 验收守门加入 “real API only”；fixture manifest 作为单一清单 | `services/api/testdata/fixtures/real_api_core_flow/manifest.json` / `services/api/scripts/real_api_core_flow.sh` |
| QA-20260211-007 | 2026-02-11 | 如何确保入口/系统/契约/验证四个闭环不会漂移？ | 只测局部导致跨层链路断裂未被及时发现 | 新增一键脚本串联 entry/system/contract/verification 并统一留证据 | 每次功能迭代后执行 `make full-loop-check`，失败即阻断验收 | `scripts/full_loop_closure_check.sh` |
| QA-20260211-008 | 2026-02-11 | 如何避免“文档有角色、运行时未强校验”导致鉴权漂移？ | token 配置缺少 role 白名单，错误 role 只能运行时暴露 | 在 `parseAuthTokens` 增加 role 白名单 fail-fast，并补契约测试覆盖未知/空 role | 调用方统一发送 `X-Auth-Source`，契约测试覆盖权限矩阵 + source 透传 | `services/api/internal/server/auth_middleware.go` / `services/api/internal/server/contract_loop_test.go` |
| QA-20260211-009 | 2026-02-11 | 如何避免“产品文档与增长文档分裂”导致体验链路断裂？ | PRD/UX 关注已登录流程，缺少 SEO 前置旅程 | 在 UX Map 增加 P0/P1，并建立 sitemap+关键词单一规范文档 | 变更时同步回写 PRD/UX/架构/优化计划四文档 | `doc/00_project/initiative_10_auth_box/SITEMAP_KEYWORD_STRATEGY.md` |
| QA-20260211-010 | 2026-02-11 | 如何避免“Public 路由已实现但架构/体验文档仍写规划中”的状态漂移？ | 实现节奏晚于文档回写，导致状态字段未二次同步 | 将 P0/P1 与 Public 路由状态改为已实现，并在架构文档绑定构建证据路径 | 每次页面路由变更后执行 `npm --prefix apps/console run build` + `ai check`，并回写 task_plan/notes/deliverable | `outputs/multi-role-brainstorm/20260211T160722Z/logs/console_build_public_routes.log` / `outputs/multi-role-brainstorm/20260211T160722Z/logs/ai_check_after_public_routes.log` |
| QA-20260211-011 | 2026-02-11 | 如何快速验证“SEO 入口 -> CTA -> onboarding”双漏斗在本地可观测？ | 仅有页面路由，缺少可查询事件聚合 | 新增 `POST /api/telemetry/public-events` 与 `GET /api/telemetry/public-funnel`，并在 `/platforms/new` 记录 `ONBOARDING_ENTRY_VIEW` | 每次发布前执行本地 smoke：POST 事件 + GET funnel + 访问 `/platforms/new?source=...` | `outputs/multi-role-brainstorm/20260211T160722Z/reports/public_funnel_after.json` |
| QA-20260211-012 | 2026-02-11 | 如何证明 telemetry 在服务重启后仍保持漏斗计数一致？ | 仅内存计数会在重启后清零 | 引入 `AUTH_BOX_CONSOLE_TELEMETRY_FILE` 持久化并在启动时回放加载 | 发布前执行“写事件->取指标->重启->再取指标”一致性断言 | `outputs/multi-role-brainstorm/20260211T160722Z/reports/persistence/persistence_assertion.txt` |
| QA-20260211-013 | 2026-02-11 | 如何验证过滤查询不会把历史/异源事件混入当前漏斗？ | 仅总量聚合无法隔离窗口与来源 | 在 `public-funnel` 增加 `window/source/persona/route` 过滤和趋势桶，并通过对照数据集验证 | 发布前执行双数据集断言：`source=beta&window=30` 命中、`source=alpha&window=30` 清空 | `outputs/multi-role-brainstorm/20260211T160722Z/reports/filter_trend/filter_trend_assertion.txt` |
| QA-20260211-014 | 2026-02-11 | 如何避免漏斗指标在多租户场景下“全局混算且缺少异常提醒”？ | 聚合口径缺少租户维度，且没有阈值告警反馈 | 新增 `tenant_id` 过滤/聚合（`top_tenants`）并输出 `alerts`（样本不足、CTR/完成率阈值） | 发布前执行租户对照断言：beta 触发双告警、alpha 不触发告警，且全局 top_tenants 计数准确 | `outputs/multi-role-brainstorm/20260211T160722Z/reports/tenant_alert/tenant_alert_assertion.txt` |
| QA-20260212-015 | 2026-02-12 | 如何避免前端自动化审计把 Next.js 预取中止请求误判为 network fail？ | Playwright 会捕获 `_rsc` 预取在导航切换时产生的 `net::ERR_ABORTED` | 审计脚本将 `_rsc` + `ERR_ABORTED` 归类为可忽略请求，并单独记录 `failed_requests_ignored` | network fail 仅统计非 `_rsc` 请求；同时保留 ignored 列表供审计追踪 | `outputs/one-click-full-delivery/20260212T022828Z/reports/frontend_audit/frontend_audit_report.json` |
| QA-20260212-016 | 2026-02-12 | 如何在不新增功能的情况下确认“当前开发基线”仍满足一键交付门禁？ | 连续多轮改动后，旧验收证据可能失效或不可代表当前基线 | 复跑 SOP 1.1 并重新留存 Round1/Round2 + 前后端专项证据 | 每次“继续/复跑”都生成独立 run 目录并回写 PDCA + deliverable | `outputs/one-click-full-delivery/20260212T032220Z` |
| QA-20260212-017 | 2026-02-12 | 为什么要支持连续命令队列模式（队列执行/继续/go）？ | 反复确认/人为停顿会打断 SOP pipeline，导致上下文漂移与证据不连贯 | 将队列规则写入底层规范，并要求每批命令结果落盘到 task_plan.md/notes.md | 规范门禁：grep 命中队列规则；流程门禁：task_plan/notes 必须写入批次命令与证据路径 | AGENTS.md / CLAUDE.md / CODEX.md / GEMINI.md |

## 2026-02-18 · REQ（UI/UX 优化）
| id | requirement | scope | status | evidence |
|---|---|---|---|---|
| REQ-20260218-UI-01 | 首页保持单一 Primary CTA，修复层级与间距节奏 | `apps/console/app/page.tsx`, `apps/console/app/globals.css` | done | `outputs/frontend-ui-ux-optimization/20260218T042527Z/reports/frontend_audit/post/visual_regression_assertion.txt` |

## 2026-02-18 · PROMPT（可复用）
| id | prompt | notes |
|---|---|---|
| PROMPT-20260218-UI-CTA | "前端 UI/UX 优化：按 ui-skills + web-interface-guidelines 收敛为单一主按钮，并输出 network/console/performance/visual 证据" | 适用于营销首页与 onboarding 入口统一 |

## 2026-02-18 · Anti-Regression Q&A
| Q | A |
|---|---|
| 症状：前端审计出现大量 404/500 与 `Cannot find module './xxx.js'`，是否代码引入回归？ | 根因多为 Next `.next` 缓存损坏或旧静态资源版本残留；先清理 `.next` 再复跑审计与 build。 |
| 修复与验证方法 | 执行 `rm -rf apps/console/.next` -> `npm run build` -> 重新启动服务并运行 frontend audit，确认 network/console/performance 通过。 |
| 防复发触发器 | 日志出现 `Cannot find module './*.js'`、`/_next/static/chunks/*.js 404` 时自动触发缓存清理与复测。 |
