#!/usr/bin/env bash
set -euo pipefail

RUN_TS="${RUN_TS:-20260213T050159Z}"
PORT="${PORT:-3444}"
N="${N:-20}"
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
OUTDIR="${OUTDIR:-outputs/performance-budget/${RUN_TS}}"

BASE_URL="http://127.0.0.1:${PORT}"

mkdir -p "${OUTDIR}/reports" "${OUTDIR}/reports/benchmarks" "${OUTDIR}/logs"

# Build console (capture build output for bundle size baseline)
(
  cd "${PROJECT_DIR}/apps/console"
  npm -s run build
) > "${PROJECT_DIR}/${OUTDIR}/reports/console_build.txt" 2>&1

# Start server
(
  cd "${PROJECT_DIR}/apps/console"
  PORT="${PORT}" npm -s run start
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
  if awk '{print $1}' "$raw_file" | rg -n "^(?!${expected_code}$)" >/dev/null; then
    echo "ERROR: ${label} had non-${expected_code} status" >&2
    return 1
  fi
}

bench_post_telemetry() {
  local label="$1"
  local raw_file="${PROJECT_DIR}/${OUTDIR}/reports/benchmarks/${label}.raw.txt"
  local payload_file="${PROJECT_DIR}/${OUTDIR}/reports/benchmarks/${label}.payload.json"

  cat > "$payload_file" <<JSON
{"event":"PERF_BUDGET_PING","route":"/","source":"sop62_${RUN_TS}","persona":"P0_DISCOVERY_USER","tenant_id":"beta"}
JSON

  # warmup
  for _ in 1 2 3; do
    curl -sS -o /dev/null -H 'content-type: application/json' -X POST "${BASE_URL}/api/telemetry/public-events" --data-binary "@${payload_file}" >/dev/null || true
  done

  : > "$raw_file"
  for _ in $(seq 1 "$N"); do
    curl -sS -o /dev/null -w "%{http_code} %{time_total}\n" -H 'content-type: application/json' -X POST "${BASE_URL}/api/telemetry/public-events" --data-binary "@${payload_file}" >> "$raw_file"
  done

  # Verify codes allow 200/202
  if awk '{print $1}' "$raw_file" | rg -n "^(?!200$|202$)" >/dev/null; then
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

