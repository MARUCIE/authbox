---
Title: USER_EXPERIENCE_MAP - initiative_10_auth_box
Scope: project
Owner: ai-agent
Status: active
LastUpdated: 2026-02-18
Related:
  - /doc/index.md
  - /doc/00_project/index.md
  - /doc/00_project/initiative_10_auth_box/index.md
  - /doc/00_project/initiative_10_auth_box/PRD.md
  - /doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md
---

<!-- AI-TOOLS:PROJECT_DIR:BEGIN -->
- **PROJECT_DIR**: `/Users/mauricewen/Projects/10-auth-box`
- -02-13T02:24:38Z`
- **RULE**: Always run tasks against the project root. If the CLI detects a mismatch, it will update this block.
<!-- AI-TOOLS:PROJECT_DIR:END -->

# 用户体验地图 - Auth Box

## DoD（完成标志）
- Round 1: `ai check` OK
- Round 2: 按本 UX Map 完成模拟人工测试并留证据
- Round 3: 真实 API fixtures 回放通过（no mock）

## 渠道与入口
- Public 官网入口（SEO）：`/`, `/product`, `/features/*`, `/use-cases/*`, `/compare/*`, `/docs`
- Web 控制台（Next.js）：`/`
- 漏斗看板（Console）：`/metrics/funnel`
- API 客户端：`/api/v1/*`（必须携带 `Authorization: Bearer <token>`，建议携带 `X-Auth-Source`）
- AI 助手网关：由 API 接入并记录审计

## Persona 对齐矩阵（Council）
| Persona | 角色说明 | 对齐旅程 | 核心入口 |
|---|---|---|---|
| P0_DISCOVERY_USER | 搜索进入的潜在客户（增长漏斗） | Journey P0 + Journey P1 | `/`, `/features/*`, `/compare/*` |
| P1_PLATFORM_ADMIN | 平台管理员（连接平台 + 创建账号） | Journey A + Journey B | `/platforms/new`, `/accounts/new` |
| P2_SECURITY_OPS | 安全运维（凭据与助手绑定） | Journey C + Journey D | `/credentials`, `/assistants` |
| P3_COMPLIANCE_AUDITOR | 合规审计（审计查询与导出） | Journey E | `/audit` |
| P4_POLICY_ADMIN | 策略管理员（接管程度配置） | Journey F | `/settings` |
| P5_GROWTH_ANALYST | 增长分析（漏斗观测） | Journey G | `/metrics/funnel` |

## 关键旅程

### Journey P0: SEO 入口到试用转化（已实现，Public V1）
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| P0-1 | 搜索进入 Landing/Feature 页面 | 展示价值主张与行业痛点映射 | 静态页面路由构建记录 |
| P0-2 | 点击 CTA（开始接入） | 跳转到 Console `platforms/new`，并写 `PUBLIC_CTA_CLICK` | `/api/telemetry/public-events` |
| P0-3 | 完成平台创建 | 进入 Journey A，显示成功反馈 | API + 前端回显 |

### Journey P1: 对比页决策（已实现，Public V1）
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| P1-1 | 访问 compare 页面 | 展示能力矩阵、边界与迁移路径 | SSG 路由构建记录 |
| P1-2 | 点击文档/案例链接 | 跳转 docs/use-case 深入页，并写 `PUBLIC_COMPARE_CLICK` | `/api/telemetry/public-events` |
| P1-3 | 点击试用 | 进入 Console onboarding | `/platforms/new` 跳转 |

- Public V1 证据：
  - `outputs/multi-role-brainstorm/20260211T160722Z/logs/console_build_public_routes.log`
  - `outputs/multi-role-brainstorm/20260211T160722Z/reports/public_funnel_after.json`

### Journey 0: 本地最小链路启动
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| Z1 | `docker compose up -d` | 启动 API/Console/PostgreSQL/Redis | 终端输出 |
| Z2 | 运行 `docker compose port console 3000`，打开输出的 URL | 展示控制台骨架首页 | 页面截图 |
| Z3 | 访问 `http://localhost:4010/health` | 返回健康检查结果 | API 响应 |

### Journey A: 平台初始化
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| A1 | 进入平台配置页（`/platforms/new`） | 校验平台参数与权限 | 页面截图/日志 |
| A2 | 保存配置（`/platforms/:id`） | 返回连接状态与可用能力，并写 `PLATFORM_CREATED` 审计事件（含 source） | API/日志记录 |

### Journey B: 账号自动创建
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| B1 | 创建账号（`/accounts/new`） | 调用平台 API 创建账号，并写 `ACCOUNT_PROVISIONED` 审计事件（含 source） | 账号记录/审计日志 |
| B2 | 查看账号详情（`/accounts/:id`） | 展示账号状态与授权绑定 | 页面截图/记录 |

### Journey C: 授权管理
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| C1 | 创建授权（`/credentials`） | 生成 API Key/OAuth Token（`platform_admin` / `security_ops`） | 凭据记录 |
| C2 | 轮换/吊销授权（`/credentials/:id/rotate`） | 更新凭据状态（`security_ops`） | 审计日志 |

### Journey D: AI 助手接入
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| D1 | 绑定 AI 助手（`/assistants/new`） | 验证权限范围 | 绑定记录 |
| D2 | 发起调用（API） | 通过网关访问外部平台（`ASSISTANT_BIND` 需 `security_ops`） | 调用日志 |

### Journey E: 审计与合规
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| E1 | 查询操作日志（`/audit`） | 返回可审计记录（Event Sourcing with hash chain；`platform_admin` / `compliance_auditor`） | 日志导出 |
| E2 | 导出报告（`/audit/exports`） | 生成审计报告（`compliance_auditor`） | 导出文件 |

### Journey F: 接管程度配置（来自调研 ai_master_control_prd.html）
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| F1 | 进入设置页（`/settings`） | 展示当前接管程度（默认辅助） | 页面截图 |
| F2 | 选择接管程度（手动/辅助/自动/托管） | 保存配置 | 审计日志 |
| F3 | 配置高风险动作确认策略 | 更新 Policy | 策略记录 |

### Journey G: 漏斗观测（已实现，Public V1+）
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| G1 | 访问 `/metrics/funnel` | 返回 SEO/产品双漏斗聚合 | 页面渲染结果 |
| G2 | 查询 `/api/telemetry/public-funnel` | 返回 counters/top routes/top sources/recent events/trend | JSON 响应 |
| G2-1 | 追加过滤参数（window/source/persona/route/tenant） | 返回过滤后的漏斗聚合与趋势 | 过滤查询结果 |
| G2-2 | 查看告警面板 | 返回样本不足/转化率低于阈值的告警项 | 告警 JSON 与页面渲染 |
| G3 | 重启服务后复查 | 指标值保持不丢失（基于持久化文件） | before/after restart 对比 |

- Journey G 证据：
  - `outputs/multi-role-brainstorm/20260211T160722Z/reports/persistence/funnel_before_restart.json`
  - `outputs/multi-role-brainstorm/20260211T160722Z/reports/persistence/funnel_after_restart.json`
  - `outputs/multi-role-brainstorm/20260211T160722Z/reports/persistence/persistence_assertion.txt`
  - `outputs/multi-role-brainstorm/20260211T160722Z/reports/filter_trend/funnel_beta_30m.json`
  - `outputs/multi-role-brainstorm/20260211T160722Z/reports/filter_trend/funnel_alpha_30m.json`
  - `outputs/multi-role-brainstorm/20260211T160722Z/reports/filter_trend/filter_trend_assertion.txt`
  - `outputs/multi-role-brainstorm/20260211T160722Z/reports/tenant_alert/funnel_beta_180m.json`
  - `outputs/multi-role-brainstorm/20260211T160722Z/reports/tenant_alert/funnel_alpha_180m.json`
  - `outputs/multi-role-brainstorm/20260211T160722Z/reports/tenant_alert/tenant_alert_assertion.txt`

## 真实流程测试基线（2026-02-11）
| 模式 | 口径 | 总步骤 | 成功 | 失败 | 成功率 |
|---|---|---:|---:|---:|---:|
| strict-baseline | 升级前（Journey C/D/E 未实现） | 18 | 11 | 7 | 61.11% |
| strict-postfix | 升级后（Journey C/D/E 已实现） | 20 | 20 | 0 | 100.00% |
| mvp0-postfix | 与 strict 同口径复测 | 20 | 20 | 0 | 100.00% |

- strict-baseline 失败集中在 Journey C/D/E 的 `501 NOT_IMPLEMENTED`（升级前）。
- 证据目录：`outputs/persona-real-flow/20260211T141210Z/`。

## 真实 API 回放基线（2026-02-11）
- Fixture 清单：`services/api/testdata/fixtures/real_api_core_flow/manifest.json`
- 采样命令：`services/api/scripts/real_api_core_flow.sh --mode capture --project-dir .`
- 回放命令：`services/api/scripts/replay_real_api_fixtures.sh --project-dir .`
- 闭环检查命令：`make full-loop-check`
- 约束：最终验收必须通过真实 API，不得以 mock 替代。

## 接管程度说明

| 模式 | 用户体验 | 适用场景 |
|------|----------|----------|
| 手动 | AI 只建议，用户手动执行每个动作 | 高敏感用户 |
| 辅助（MVP 默认） | AI 生成方案，用户一次确认后批量执行 | 标准接入 |
| 自动 | 低风险自动执行，高风险弹窗确认 | 稳定期用户 |
| 托管 | 完全托管，需更强验证 | 遗产/监护 |

## 一键全量交付验收计划（2026-02-12，已完成）
- SOP 证据目录：`outputs/one-click-full-delivery/20260212T022828Z`
- Round 2 人工模拟覆盖：
  - P0/P1：Public 入口 -> CTA -> onboarding
  - A/B/C/D/E：平台/账号/凭据/助手/审计主流程
  - G：漏斗查询（含 tenant 过滤与 alerts）
- 记录要求：
  - 每个 Journey 至少 1 条成功证据
  - 失败路径需记录错误码与定位信息
- 执行结果：
  - UX Map Round 2 断言 PASS：`outputs/one-click-full-delivery/20260212T022828Z/reports/uxmap_round2/uxmap_round2_assertion.txt`
  - 真实 API Journey 证据：`outputs/one-click-full-delivery/20260212T022828Z/reports/full_loop/system_capture/reports/run_report.json`

## SOP 4.1 回归记录（2026-02-12）
- Run：`outputs/project-regression/20260212T030804Z`
- Round 2（UX Map）回归路径：
  - `journey_p0_home.html`
  - `journey_p0_product.html`
  - `journey_p1_compare.html`
  - `journey_a_platform_new.html`
  - `journey_g_metrics.html`
  - `journey_g_funnel_beta.json`
- 断言：`outputs/project-regression/20260212T030804Z/reports/uxmap_round2/uxmap_round2_assertion.txt`
- 结果：`home/product/compare/platforms_new/metrics/funnel` 全 PASS。

## 一键全量交付 Round 2 复测记录（2026-02-12，Run 20260212T032220Z）
- 复测路径：`/`、`/product`、`/compare/hashicorp-vault-alternative`、`/platforms/new?source=ux_round2&tenant_id=beta`、`/metrics/funnel?window_minutes=180&tenant_id=beta`。
- 关键事件：`PUBLIC_CTA_CLICK`、`ONBOARDING_ENTRY_VIEW`。
- 结果：`outputs/one-click-full-delivery/20260212T032220Z/reports/uxmap_round2/uxmap_round2_assertion.txt`（PASS）。
- 关联守门：frontend audit 断言 PASS、backend full-loop 断言 PASS（同 run 目录）。
- 备注：本轮为既有旅程复核，不新增 UX 旅程定义。

## SOP 4.1 Round 2 回归记录（2026-02-12，Run 20260212T034924Z）
- 复测路径：`/`、`/product`、`/compare/hashicorp-vault-alternative`、`/platforms/new?source=ux_round2&tenant_id=beta`、`/metrics/funnel?window_minutes=180&tenant_id=beta`。
- 关键事件：`PUBLIC_CTA_CLICK`、`ONBOARDING_ENTRY_VIEW`。
- 结果：`outputs/project-regression/20260212T034924Z/reports/uxmap_round2/uxmap_round2_assertion.txt`（overall.pass=PASS）。
- 卡点修复：上报 payload 字段修正为 `event` 后，事件上报与漏斗查询恢复正常。

## SOP 4.1 Round 2 回归记录（2026-02-13，Run 20260213T021241Z）
- 复测路径：`/`、`/product`、`/compare/hashicorp-vault-alternative`、`/platforms/new?source=ux_round2_20260213T021241Z&tenant_id=beta`、`/metrics/funnel?window_minutes=180&tenant_id=beta`。
- 关键事件：`PUBLIC_CTA_CLICK`、`ONBOARDING_ENTRY_VIEW`。
- 结果：`outputs/project-regression/20260213T021241Z/reports/uxmap_round2/uxmap_round2_assertion.txt`（overall.pass=PASS）。
- E2E（real API + contract）PASS：`outputs/project-regression/20260213T021241Z/reports/full_loop_replay/reports/full_loop_summary.json`。

## Journey P0 UI/UX 层级优化（2026-02-18）
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| P0-0 | 进入首页 `/` | 展示单一主按钮 `Start onboarding`，其余入口降级为次级链接 | `apps/console/app/page.tsx` |
| P0-0.1 | 浏览首页分区 | 按 Hero 主叙事 -> Activation path -> Features/Use cases/Compare 的节奏阅读 | `apps/console/app/globals.css` |
| P0-0.2 | 点击主按钮 | 进入 `/platforms/new?source=home_primary_cta&tenant_id=public`，写 `PUBLIC_CTA_CLICK` 事件 | `apps/console/components/public-event-tracker.tsx` |

- 回归证据：
  - pre：`outputs/frontend-ui-ux-optimization/20260218T042527Z/reports/frontend_audit/pre/frontend_audit_assertion.txt`
  - post：`outputs/frontend-ui-ux-optimization/20260218T042527Z/reports/frontend_audit/post/frontend_audit_assertion.txt`
  - visual 断言：`outputs/frontend-ui-ux-optimization/20260218T042527Z/reports/frontend_audit/post/visual_regression_assertion.txt`
- 2026-02-18 UI/UX Round 2 证据：`outputs/frontend-ui-ux-optimization/20260218T042527Z/reports/uxmap_round2/uxmap_round2_assertion.txt`（含 `primary_cta_count_home=1`）

## Journey H: 发布门禁与观察闭环（SOP 治理新增，2026-02-18）
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| H1 | 选择发布变更并提交发布申请 | 系统按风险规则打标（P0/P1/P2） | 风险分级记录 |
| H2 | 触发自动化门禁 | 执行 Layer A（lint/type/test/build/security）并返回 gate 结果 | CI 报告 / Gate 断言 |
| H3 | 查看并补齐发布证据包 | 系统校验 Layer B（风险清单、回归清单、签署记录、证据完整性） | `outputs/<sop-id>/<run-id>/` |
| H4 | Gatekeeper 签署并发布 | 系统记录签署人与发布时间，进入观察窗口 | 发布日志 / 审计事件 |
| H5 | 观察 24h/72h 指标 | 若超阈值触发回滚/冻结/补测并创建 postmortem | 观察报告 / postmortem 链接 |

- Journey H 验证入口（本轮调研）：
  - `outputs/sota-product-sop-research/20260218T064240Z/reports/sop_benchmark_matrix.md`
  - `outputs/sota-product-sop-research/20260218T064240Z/reports/transferability_and_risks.md`

- Journey H 状态更新（2026-02-18）：
  - 执行入口：`scripts/release_gate.sh`
  - 结果样本：`outputs/release-gate/20260218T112018Z/reports/release_gate_summary.json`
  - 安全阻断样本：`outputs/release-gate/20260218T112018Z-p1-sample/reports/release_gate_summary.json`
