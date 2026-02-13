# Performance Budget Baseline (SOP 6.2)

- run_ts: 20260213T050159Z
- first_load_js_shared_kb: 87.1

## Endpoint Latency (curl time_total, seconds)

| endpoint | count | p50_s | p95_s | max_s | codes |
|---|---:|---:|---:|---:|---|
| home.raw | 20 | 0.001184 | 0.001572 | 0.001629 | 200:20 |
| product.raw | 20 | 0.001012 | 0.001218 | 0.001221 | 200:20 |
| compare.raw | 20 | 0.000881 | 0.001066 | 0.001155 | 200:20 |
| onboarding_entry.raw | 20 | 0.010369 | 0.011171 | 0.012047 | 200:20 |
| telemetry_post.raw | 20 | 0.001192 | 0.001435 | 0.001477 | 202:20 |
| metrics_funnel_html.raw | 20 | 0.00931 | 0.009683 | 0.01013 | 200:20 |
| metrics_funnel_json.raw | 20 | 0.009141 | 0.009499 | 0.009746 | 200:20 |

## Budgets

- first_load_js_shared_kb_max: 100.0
- endpoint_p95_s_max: 0.2

## Evaluation

- pass: True
