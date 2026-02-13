# Performance Budget Baseline (SOP 6.2)

- run_ts: 20260213T050159Z
- first_load_js_shared_kb: 87.1

## Endpoint Latency (curl time_total, seconds)

| endpoint | count | p50_s | p95_s | max_s | codes |
|---|---:|---:|---:|---:|---|
| compare.raw | 20 | 0.000921 | 0.001190 | 0.001203 | 200:20 |
| home.raw | 20 | 0.001313 | 0.001914 | 0.002013 | 200:20 |
| metrics_funnel_html.raw | 20 | 0.009425 | 0.011285 | 0.032175 | 200:20 |
| metrics_funnel_json.raw | 20 | 0.009114 | 0.009580 | 0.009797 | 200:20 |
| onboarding_entry.raw | 20 | 0.009768 | 0.010788 | 0.011305 | 200:20 |
| product.raw | 20 | 0.001103 | 0.001383 | 0.001481 | 200:20 |
| telemetry_post.raw | 20 | 0.001054 | 0.001224 | 0.001409 | 400:20 |

## Budgets

- first_load_js_shared_kb_max: 100.0
- endpoint_p95_s_max: 0.2

## Evaluation

- pass: True
