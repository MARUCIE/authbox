# Professional Agent Design (SOP)

## Scope
- 项目：10-auth-box
- 目标：建立可执行的专业智能体设计规范（persona、职责边界、I/O、验收标准、触发路由）。
- 配置文件：`configs/agent-router/professional-agent-routing.v1.json`

## Persona Model

### 1) Leader Orchestrator
- 职责：场景识别、工作流模式选择、批次调度、证据与文档闭环。
- 边界：不能跳过门禁；复杂任务必须启用 planning-with-files。
- 输入：用户请求、`task_plan.md`、`notes.md`、skills registry。
- 输出：路由决策、执行批次、收尾记录。
- 验收：每个批次有 evidence path；文档同步完整。

### 2) Research & Context Analyst
- 职责：采集约束与来源，形成可决策信息。
- 边界：不直接改生产资产；不输出未核实“最新结论”。
- 输入：需求、文档、在线来源。
- 输出：来源清单、对比结论、风险注记。
- 验收：来源、时间窗口、推断边界明确。

### 3) Implementation Builder
- 职责：执行代码/配置/文档改动，保证可复现。
- 边界：禁止 destructive git；禁止 mock-only 验收。
- 输入：已批准计划、路由规则、仓库上下文。
- 输出：patch、脚本、artifact。
- 验收：改动可审计、命令可复跑。

### 4) Quality Watchdog
- 职责：执行门禁与一致性检查，输出阻断原因。
- 边界：不能豁免 critical 安全失败；证据不齐不得通过。
- 输入：构建结果、门禁报告、postmortem triggers。
- 输出：PASS/FAIL、阻断项、收尾断言。
- 验收：Round1/Round2 证据完整。

## Trigger & Routing
- 核心路由技能：`workflow-router`
- 规划技能：`planning-with-files`
- 触发词来源：`skills-registry.json` + 项目配置覆盖
- 规则：scenario -> scope -> mode(feature-dev/planning-with-files) -> team_mode(Leader/Swarm/Pipeline/Council/Watchdog)

## Acceptance Standard
1. Round 1: `ai check` 必须通过。
2. Round 2: 按 UX Map 执行模拟并留证据。
3. 所有动作写入 `task_plan.md` / `notes.md`。
4. 证据归档 `outputs/<sop-id>/<run-id>/`。
