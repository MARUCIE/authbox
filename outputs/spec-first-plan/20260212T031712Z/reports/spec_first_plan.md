# SOTA 规范化计划（Spec-first）

- generated_at: 2026-02-12T03:19:00Z
- sop_run_id: 1-2-1fe1dc60
- run_root: outputs/spec-first-plan/20260212T031712Z

## 1) 目标（Goals）
1. 在代码改动前，先固化本轮执行规范：目标、约束、验收标准、测试计划。
2. 产出可审计证据链，所有关键动作可在 `outputs/spec-first-plan/20260212T031712Z` 回放。
3. 按验收标准逐条复核，并形成 PASS/FAIL 结论，不做口头完成声明。

## 2) 非目标（Non-goals）
1. 不新增业务功能、不扩展产品范围。
2. 不改动系统边界与架构分层。
3. 不引入 mock 替代既有真实 API 验证结论。

## 3) 约束（Constraints）
1. 工具优先级：skill > plugin > MCP > manual，MCP 不可用时必须记录 fallback。
2. 文档追踪：关键决策写入 `task_plan.md` 与 `notes.md`。
3. 证据路径：统一落盘到 `outputs/spec-first-plan/20260212T031712Z`。
4. 验收守门：必须通过 `ai check`，并给出逐条验收复核表。

## 4) 验收标准（Acceptance Criteria）
- AC-1: Step 1 已完成（planning-with-files 初始化并读取 task_plan/notes）。
- AC-2: 已产出 spec-first 计划文档，且包含 Goals/Non-goals/Constraints/Acceptance/Test Plan 五部分。
- AC-3: 已执行实现动作并生成逐条验收复核报告（每条 AC 有证据路径）。
- AC-4: 本轮 `ai check` 通过。
- AC-5: `task_plan.md`、`notes.md`、`deliverable.md` 已同步本轮记录。

## 5) 测试计划（Test Plan）
1. 流程测试：检查 SOP Step 状态（Step1->Step3）与 run completion。
2. 证据测试：验证关键证据文件存在并可读取。
3. 质量门禁：执行 `ai check`，记录 run_dir 与结论。
4. 验收复核：生成 AC 对照表并给出 PASS/FAIL。
