#!/usr/bin/env bash
set -euo pipefail

RUN_TS="${RUN_TS:-20260213T050159Z}"
PORT="${PORT:-3444}"
N="${N:-20}"
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
OUTDIR="${OUTDIR:-outputs/performance-budget/${RUN_TS}}"

BASE_URL="http://127.0.0.1:${PORT}"

mkdir -p "${OUTDIR}/reports" "${OUTDIR}/reports/benchmarks" "${OUTDIR}/logs"

# Isolate telemetry persistence to this run to avoid polluting tracked files.
TELEMETRY_FILE="${PROJECT_DIR}/${OUTDIR}/reports/benchmarks/public-events.ndjson"

# Build console (capture build output for bundle size baseline)
(
  cd "${PROJECT_DIR}/apps/console"
  npm -s run build
) > "${PROJECT_DIR}/${OUTDIR}/reports/console_build.txt" 2>&1

# Start server
(
  cd "${PROJECT_DIR}/apps/console"
  AUTH_BOX_CONSOLE_TELEMETRY_FILE="${TELEMETRY_FILE}" \
    PORT="${PORT}" \
    npm -s run start
) > "${PROJECT_DIR}/${OUTDIR}/logs/console_start.log" 2>&1 &
SERVER_PID=$!
echo "${SERVER_PID}" > "${PROJECT_DIR}/${OUTDIR}/logs/console_start.pid"

cleanup() {
  if kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" || true
    sleep 1
    kill -9 "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Wait for ready
for i in $(seq 1 60); do
  if curl -sf "${BASE_URL}/" >/dev/null; then
    break
  fi
  sleep 0.5
  if [ "$i" -eq 60 ]; then
    echo "ERROR: console did not become ready on ${BASE_URL}" >&2
    exit 1
  fi
done

bench_get() {
  local path="$1"
  local label="$2"
  local expected_code="$3"
  local raw_file="${PROJECT_DIR}/${OUTDIR}/reports/benchmarks/${label}.raw.txt"

  # warmup
  for _ in 1 2 3; do
    curl -sS -o /dev/null "${BASE_URL}${path}" >/dev/null || true
  done

  : > "$raw_file"
  for _ in $(seq 1 "$N"); do
    curl -sS -o /dev/null -w "%{http_code} %{time_total}\n" "${BASE_URL}${path}" >> "$raw_file"
  done

  # Verify codes
  if awk '{print $1}' "$raw_file" | grep -qv "^${expected_code}$"; then
    echo "ERROR: ${label} had non-${expected_code} status" >&2
    return 1
  fi
}

bench_post_telemetry() {
  local label="$1"
  local raw_file="${PROJECT_DIR}/${OUTDIR}/reports/benchmarks/${label}.raw.txt"
  local payload_file="${PROJECT_DIR}/${OUTDIR}/reports/benchmarks/${label}.payload.json"

  # Must be a valid PublicEventName, otherwise API returns INVALID_EVENT (400).
  cat > "$payload_file" <<JSON
{"event":"PUBLIC_PAGE_VIEW","route":"/","source":"sop62_${RUN_TS}","persona":"P0_DISCOVERY_USER","tenant_id":"beta"}
JSON

  # warmup
  for _ in 1 2 3; do
    curl -sS -o /dev/null -H 'content-type: application/json' -X POST "${BASE_URL}/api/telemetry/public-events" --data-binary "@${payload_file}" >/dev/null || true
  done

  : > "$raw_file"
  for _ in $(seq 1 "$N"); do
    curl -sS -o /dev/null -w "%{http_code} %{time_total}\n" -H 'content-type: application/json' -X POST "${BASE_URL}/api/telemetry/public-events" --data-binary "@${payload_file}" >> "$raw_file"
  done

  # Verify codes allow 202 (Next.js API accepts) and tolerate 200.
  if awk '{print $1}' "$raw_file" | grep -qvE '^(200|202)$'; then
    echo "ERROR: ${label} had non-200/202 status" >&2
    return 1
  fi
}

bench_get "/" "home" 200
bench_get "/product" "product" 200
bench_get "/compare/hashicorp-vault-alternative" "compare" 200
bench_get "/platforms/new?source=sop62_${RUN_TS}&tenant_id=beta" "onboarding_entry" 200
bench_post_telemetry "telemetry_post"
bench_get "/metrics/funnel?window_minutes=180&tenant_id=beta" "metrics_funnel_html" 200
bench_get "/metrics/funnel?window_minutes=180&tenant_id=beta&format=json" "metrics_funnel_json" 200

PROJECT_DIR="${PROJECT_DIR}" OUTDIR="${OUTDIR}" RUN_TS="${RUN_TS}" python3 - <<'PY'
import json
import math
import os
import re
from pathlib import Path

project_dir = Path(os.environ["PROJECT_DIR"])
outdir = Path(os.environ["OUTDIR"])
run_ts = os.environ["RUN_TS"]
bench_dir = project_dir / outdir / "reports" / "benchmarks"

budgets = {
    "first_load_js_shared_kb_max": 100.0,
    "endpoint_p95_s_max": 0.2,
}

console_build_txt = project_dir / outdir / "reports" / "console_build.txt"
first_load_js_shared_kb = None
if console_build_txt.exists():
    text = console_build_txt.read_text(encoding="utf-8", errors="replace")
    m = re.search(r"First Load JS shared by all\s+([0-9.]+)\s*kB", text)
    if m:
        try:
            first_load_js_shared_kb = float(m.group(1))
        except Exception:
            first_load_js_shared_kb = None


def quantile_linear(values, q):
    if not values:
        return None
    values = sorted(values)
    if len(values) == 1:
        return values[0]
    pos = q * (len(values) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(values) - 1)
    frac = pos - lo
    return values[lo] * (1 - frac) + values[hi] * frac


def parse_raw(label: str):
    p = bench_dir / f"{label}.raw.txt"
    rows = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        code_s, t_s = line.split()
        rows.append((code_s, float(t_s)))

    codes = {}
    times = []
    for code_s, t in rows:
        codes[code_s] = codes.get(code_s, 0) + 1
        times.append(t)

    times_sorted = sorted(times)
    return {
        "count": len(times_sorted),
        "codes": codes,
        "min_s": times_sorted[0] if times_sorted else None,
        "max_s": times_sorted[-1] if times_sorted else None,
        "mean_s": (sum(times_sorted) / len(times_sorted)) if times_sorted else None,
        "p50_s": quantile_linear(times_sorted, 0.50) if times_sorted else None,
        "p95_s": quantile_linear(times_sorted, 0.95) if times_sorted else None,
    }


endpoints = {}
for label in [
    "home",
    "product",
    "compare",
    "onboarding_entry",
    "telemetry_post",
    "metrics_funnel_html",
    "metrics_funnel_json",
]:
    endpoints[f"{label}.raw"] = parse_raw(label)

# Evaluate budget
violations = []
if first_load_js_shared_kb is not None and first_load_js_shared_kb > budgets["first_load_js_shared_kb_max"]:
    violations.append(
        {
            "metric": "first_load_js_shared_kb",
            "observed": first_load_js_shared_kb,
            "target_max": budgets["first_load_js_shared_kb_max"],
        }
    )

for name, stats in endpoints.items():
    p95 = stats.get("p95_s")
    if p95 is None:
        continue
    if p95 > budgets["endpoint_p95_s_max"]:
        violations.append(
            {
                "metric": "endpoint_p95_s",
                "endpoint": name,
                "observed": p95,
                "target_max": budgets["endpoint_p95_s_max"],
            }
        )

summary = {
    "budget_evaluation": {
        "pass": len(violations) == 0,
        "violations": violations,
    },
    "budgets": {
        "endpoint_p95_s_max": budgets["endpoint_p95_s_max"],
        "first_load_js_shared_kb_max": budgets["first_load_js_shared_kb_max"],
    },
    "console_build": {
        "first_load_js_shared_kb": first_load_js_shared_kb,
    },
    "endpoints": endpoints,
    "run_ts": run_ts,
}

bench_dir.mkdir(parents=True, exist_ok=True)
(bench_dir / "benchmark_summary.json").write_text(
    json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
)

# Markdown report
rows = []
rows.append("# Performance Budget Baseline (SOP 6.2)\n")
rows.append(f"- run_ts: {run_ts}")
rows.append(f"- first_load_js_shared_kb: {first_load_js_shared_kb}\n")
rows.append("## Endpoint Latency (curl time_total, seconds)\n")
rows.append("| endpoint | count | p50_s | p95_s | max_s | codes |")
rows.append("|---|---:|---:|---:|---:|---|")


def fmt(v):
    if v is None:
        return ""
    return f"{v:.6f}".rstrip("0").rstrip(".") if isinstance(v, float) else str(v)


for endpoint, stats in endpoints.items():
    codes_str = ", ".join(f"{k}:{v}" for k, v in sorted(stats["codes"].items()))
    rows.append(
        "| "
        + " | ".join(
            [
                endpoint,
                str(stats["count"]),
                fmt(stats["p50_s"]),
                fmt(stats["p95_s"]),
                fmt(stats["max_s"]),
                codes_str,
            ]
        )
        + " |"
    )

rows.append("\n## Budgets\n")
rows.append(f"- first_load_js_shared_kb_max: {budgets['first_load_js_shared_kb_max']}")
rows.append(f"- endpoint_p95_s_max: {budgets['endpoint_p95_s_max']}\n")
rows.append("## Evaluation\n")
rows.append(f"- pass: {summary['budget_evaluation']['pass']}")

(bench_dir / "benchmark_report.md").write_text("\n".join(rows) + "\n", encoding="utf-8")
(bench_dir / "benchmarks_done.txt").write_text("done\n", encoding="utf-8")
PY
