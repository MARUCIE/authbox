# SOP 6.2 Summary - Performance & Cost Budget

- Run ID: 6-2-d0d3a92c
- run_ts: 20260213T050159Z
- Evidence dir: outputs/performance-budget/20260213T050159Z

## Budgets

- first_load_js_shared_kb_max: 100.0
- endpoint_p95_s_max: 0.2

## Baseline Results

- first_load_js_shared_kb: 87.1
- endpoints p95: see `reports/benchmarks/benchmark_report.md`
- evaluation: PASS

## Notes

- Benchmarks were rerun after fixing telemetry payload to a valid `PublicEventName` and replacing unsupported ripgrep lookahead checks. v1 artifacts preserved under `reports/benchmarks_v1/`.
