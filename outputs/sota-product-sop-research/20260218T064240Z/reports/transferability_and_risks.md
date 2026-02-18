# Transferable Checklist and Risks

## Transferable Checklist (Can be adopted by 10-auth-box)

1. 分级发布策略（P0/P1/P2）
- P0: 高风险改动（auth/session/secret/permission/data export）必须走双重门禁（自动+人工）。
- P1: 中风险功能（关键路径 UI/API）走自动门禁+抽样人工验证。
- P2: 低风险改动走标准 CI + smoke。

2. 双层门禁
- Layer A (pipeline): lint/type/test/build/security scan 必须全绿。
- Layer B (pre-release): 风险清单 + 回归清单 + evidence 打包齐全。

3. 强制证据目录规范
- 统一 `outputs/<sop-id>/<run-id>/`，包含 logs/reports/diff/snapshots。

4. 角色与责任
- Owner（产品/功能负责人）
- Gatekeeper（质量/安全审批）
- Implementer（开发）
- Observer（发布后监控）

5. 量化指标（最小集）
- Gate pass rate
- Regression escape rate
- Time-to-detect / time-to-recover
- Error-budget burn rate
- Evidence completeness rate

6. 发布后闭环
- 24h/72h 观察窗口
- 若触发阈值自动创建 postmortem 条目并回写 Anti-Regression Q&A

## Risks (If migrated poorly)

1. 过度门禁导致交付速度骤降
- 缓解：按风险分级启用门禁，不做一刀切。

2. 指标形式化，缺少决策价值
- 缓解：指标绑定动作阈值（触发回滚/冻结/补测）。

3. 角色不清导致“无人负责”
- 缓解：每次发布明确 gatekeeper 与最终签署人。

4. 证据留存不完整，无法审计
- 缓解：把 evidence completeness 设为发布门禁之一。

5. 只做发布前检查，忽略发布后回归
- 缓解：引入固定观察窗口 + 自动化巡检 + postmortem 触发器。

## Inference Boundary

- 上述 checklist 为对来源 SOP 的可迁移抽象（推断），不是对任一厂商流程的逐字复刻。
- 所有“可迁移项”已优先映射到当前仓库已有资产：PDCA 文档、outputs 证据树、ai check、UX Map 人工模拟流程。
