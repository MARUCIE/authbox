# SOP 4.1 项目级全链路回归报告

- SOP Run ID: 4-1-2073e5d3
- Evidence Root: outputs/project-regression/20260212T034924Z

## Step 结果
1. planning-with-files 读取：PASS
2. ralph-loop 启用：PASS
3. UX Map 核心路径回归：PASS
4. 卡点修复 + 同类扫描：PASS
5. PDCA 四文档回写：PASS
6. Round 1 + Round 2：PASS

## 关键证据
- Round 2 assertion: outputs/project-regression/20260212T034924Z/reports/uxmap_round2/uxmap_round2_assertion.txt
- Similar scan assertion: outputs/project-regression/20260212T034924Z/reports/similar_issue_scan/similar_issue_scan_assertion.txt
- Full-loop summary: outputs/project-regression/20260212T034924Z/reports/full_loop_closure/reports/full_loop_summary.json
- Round summary: outputs/project-regression/20260212T034924Z/reports/sop41_round_summary.txt
- Round 1 ai check: outputs/project-regression/20260212T034924Z/logs/ai_check_round1.log

## 卡点与修复
- 卡点：telemetry 事件请求使用 `event_type` 导致 `INVALID_EVENT`（400）。
- 修复：统一改为 `event` 字段并按 `status=accepted` 校验。
- 同类扫描：`rg -n "event_type\s*:|\"event_type\"" apps scripts doc` -> PASS（无命中）。
