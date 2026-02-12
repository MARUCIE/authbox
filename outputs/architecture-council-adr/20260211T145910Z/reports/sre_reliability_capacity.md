# SRE View (Reliability + Capacity)

## Reliability Snapshot
- Strengths:
  - Graceful shutdown present (`signal.NotifyContext`, server shutdown timeout).
  - Request timeout middleware configured (`30s`).
  - Structured logging enabled (`slog` JSON).
- Gaps:
  - No readiness/liveness split endpoint.
  - No service-level SLOs or alerts codified.
  - No persistent metrics/traces pipeline configured yet.

## Capacity Baseline Recommendation
| Tier | Assumed Load | Target p95 | Error Rate | Availability |
|---|---:|---:|---:|---:|
| MVP-1 | 30 RPS steady / 100 RPS burst | < 300ms | < 1% | 99.5% |
| MVP-2 | 100 RPS steady / 300 RPS burst | < 250ms | < 0.5% | 99.9% |

## Observability Decision Set
1. Metrics: request_count, request_latency, error_rate, saturation (CPU/mem), queue depth.
2. Tracing: propagate request_id/trace_id across handler and provider calls.
3. Logging: mandatory fields (`request_id`, `actor`, `resource`, `decision`, `latency_ms`).
4. Alerts:
   - p95 latency > 300ms for 10m
   - 5xx rate > 1% for 5m
   - audit export failure rate > 2% for 10m

## Reliability ADR Inputs
- Add `/ready` endpoint with dependency checks (Postgres/Redis).
- Add load-test gate in CI for regression detection.
