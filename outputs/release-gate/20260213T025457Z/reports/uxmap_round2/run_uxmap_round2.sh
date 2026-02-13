#!/usr/bin/env bash
set -euo pipefail

RUN_TS="${RUN_TS:-20260213T025457Z}"
PORT="${PORT:-3422}"
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
OUTDIR="${OUTDIR:-outputs/release-gate/${RUN_TS}}"
UXDIR="${UXDIR:-${OUTDIR}/reports/uxmap_round2}"

BASE_URL="http://127.0.0.1:${PORT}"

mkdir -p "${UXDIR}"

cd "${PROJECT_DIR}/apps/console"

# Build (idempotent)
npm -s run build

# Start server
PORT="${PORT}" npm -s run start > "${PROJECT_DIR}/${OUTDIR}/logs/console_start.log" 2>&1 &
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

# Helper: fetch url and capture status
fetch() {
  local path="$1"
  local out="$2"
  local status_file="$3"
  local url="${BASE_URL}${path}"
  local code
  code=$(curl -sS -o "${out}" -w "%{http_code}" "${url}")
  echo "${code}" > "${status_file}"
  if [ "${code}" != "200" ]; then
    echo "ERROR: GET ${path} returned ${code}" >&2
    return 1
  fi
}

post_event() {
  local payload_file="$1"
  local out_body="$2"
  local out_status="$3"
  local code
  code=$(curl -sS -o "${out_body}" -w "%{http_code}" -H 'content-type: application/json' -X POST "${BASE_URL}/api/telemetry/public-events" --data-binary "@${payload_file}")
  echo "${code}" > "${out_status}"
  # Accept 200/202 depending on implementation
  if [ "${code}" != "200" ] && [ "${code}" != "202" ]; then
    echo "ERROR: POST /api/telemetry/public-events returned ${code}" >&2
    return 1
  fi
}

cd "${PROJECT_DIR}"

# Journey P0: public discovery
fetch "/" "${UXDIR}/journey_p0_home.html" "${UXDIR}/journey_p0_home.status.txt"
fetch "/product" "${UXDIR}/journey_p0_product.html" "${UXDIR}/journey_p0_product.status.txt"
fetch "/compare/hashicorp-vault-alternative" "${UXDIR}/journey_p1_compare.html" "${UXDIR}/journey_p1_compare.status.txt"

# Journey A: onboarding entry
fetch "/platforms/new?source=release_gate_${RUN_TS}&tenant_id=beta" "${UXDIR}/journey_a_platform_new.html" "${UXDIR}/journey_a_platform_new.status.txt"

# Telemetry events (public funnel)
cat > "${UXDIR}/event_onboarding_entry.json" <<JSON
{"event":"ONBOARDING_ENTRY_VIEW","route":"/platforms/new","source":"release_gate_${RUN_TS}","persona":"P1_PLATFORM_ADMIN","tenant_id":"beta"}
JSON
post_event "${UXDIR}/event_onboarding_entry.json" "${UXDIR}/event_onboarding_entry.response.json" "${UXDIR}/event_onboarding_entry.status.txt"

cat > "${UXDIR}/event_public_cta_click.json" <<JSON
{"event":"PUBLIC_CTA_CLICK","route":"/product","source":"release_gate_${RUN_TS}","persona":"P0_DISCOVERY_USER","tenant_id":"beta","metadata":{"target":"/platforms/new"}}
JSON
post_event "${UXDIR}/event_public_cta_click.json" "${UXDIR}/event_public_cta_click.response.json" "${UXDIR}/event_public_cta_click.status.txt"

# Funnel + metrics pages
fetch "/metrics/funnel?window_minutes=180&tenant_id=beta" "${UXDIR}/journey_g_metrics.html" "${UXDIR}/journey_g_metrics.status.txt"
code=$(curl -sS -o "${UXDIR}/journey_g_funnel_beta.json" -w "%{http_code}" "${BASE_URL}/metrics/funnel?window_minutes=180&tenant_id=beta&format=json")
echo "${code}" > "${UXDIR}/journey_g_funnel_beta.status.txt"
if [ "${code}" != "200" ]; then
  echo "ERROR: GET /metrics/funnel json returned ${code}" >&2
  exit 1
fi

# Assertion summary
cat > "${UXDIR}/uxmap_round2_assertion.txt" <<TXT
uxmap_round2=PASS
run_ts=${RUN_TS}
base_url=${BASE_URL}
p0_home=200
p0_product=200
p1_compare=200
onboarding_entry=200
telemetry_onboarding_entry_status=$(cat "${UXDIR}/event_onboarding_entry.status.txt")
telemetry_public_cta_click_status=$(cat "${UXDIR}/event_public_cta_click.status.txt")
metrics_html=200
funnel_json=$(cat "${UXDIR}/journey_g_funnel_beta.status.txt")
TXT

