#!/usr/bin/env bash
set -euo pipefail

MODE="capture"
PROJECT_DIR=""
EVIDENCE_DIR=""
START_API=1
API_BASE_OVERRIDE="${API_BASE:-}"

usage() {
  cat <<'EOF'
Usage:
  real_api_core_flow.sh [--mode capture|replay] [--project-dir <path>] [--evidence-dir <path>] [--no-start-api]

Notes:
  - Runs against real API only (no mock).
  - Default mode is capture.
  - In capture mode, updates fixtures under services/api/testdata/fixtures/real_api_core_flow/latest.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --project-dir)
      PROJECT_DIR="$2"
      shift 2
      ;;
    --evidence-dir)
      EVIDENCE_DIR="$2"
      shift 2
      ;;
    --no-start-api)
      START_API=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$MODE" != "capture" && "$MODE" != "replay" ]]; then
  echo "Invalid mode: $MODE" >&2
  exit 1
fi

if [[ -z "$PROJECT_DIR" ]]; then
  PROJECT_DIR="$(git rev-parse --show-toplevel)"
fi

MANIFEST="$PROJECT_DIR/services/api/testdata/fixtures/real_api_core_flow/manifest.json"
FIXTURE_ROOT="$PROJECT_DIR/services/api/testdata/fixtures/real_api_core_flow"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Fixture manifest not found: $MANIFEST" >&2
  exit 1
fi

if [[ -z "$EVIDENCE_DIR" ]]; then
  EVIDENCE_DIR="$PROJECT_DIR/outputs/real-api-fixtures-replay/manual-$(date -u +%Y%m%dT%H%M%SZ)"
fi

LOG_DIR="$EVIDENCE_DIR/logs"
REPORT_DIR="$EVIDENCE_DIR/reports"
CAPTURE_DIR="$EVIDENCE_DIR/fixtures"
mkdir -p "$LOG_DIR" "$REPORT_DIR" "$CAPTURE_DIR"

DEFAULT_BASE="$(jq -r '.base_url' "$MANIFEST")"
API_BASE="${API_BASE_OVERRIDE:-$DEFAULT_BASE}"
ADMIN_TOKEN="$(jq -r '.tokens.admin' "$MANIFEST")"
SEC_TOKEN="$(jq -r '.tokens.security_ops' "$MANIFEST")"
AUD_TOKEN="$(jq -r '.tokens.auditor' "$MANIFEST")"

CONTAINER_NAME="auth-box-api-real-fixture"
API_SOURCE_DIR="$PROJECT_DIR/services/api"

PLATFORM_ID=""
ACCOUNT_ID=""
CREDENTIAL_ID=""
ASSISTANT_ID=""
EXPORT_ID=""

cleanup() {
  if [[ "$START_API" -eq 1 ]]; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

start_real_api() {
  if [[ "$START_API" -eq 0 ]]; then
    return
  fi

  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER_NAME" -p 4010:8080 \
    -e AUTH_BOX_HTTP_ADDR=':8080' \
    -e AUTH_BOX_ENV='local' \
    -e AUTH_BOX_VERSION='0.1.0' \
    -e AUTH_BOX_AUTH_TOKENS="local-admin-token:actor-platform-admin:platform_admin|security_ops|compliance_auditor|policy_admin,local-security-token:actor-security-ops:security_ops,local-auditor-token:actor-compliance-auditor:compliance_auditor" \
    -v "$API_SOURCE_DIR:/src" \
    -w /src \
    golang:1.22-alpine sh -lc '/usr/local/go/bin/go run ./cmd/api' >"$LOG_DIR/api_container_id.log"

  for _ in $(seq 1 40); do
    if curl -fsS "$API_BASE/health" >/tmp/real_api_health.json 2>/dev/null; then
      cp /tmp/real_api_health.json "$REPORT_DIR/health.json"
      return
    fi
    sleep 1
  done

  echo "API health check failed at $API_BASE/health" >&2
  exit 1
}

assert_status() {
  local step_id="$1"
  local actual="$2"
  local expected="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "[$step_id] expected status=$expected actual=$actual" >&2
    exit 1
  fi
}

token_value() {
  local token_name="$1"
  case "$token_name" in
    admin) echo "$ADMIN_TOKEN" ;;
    security_ops) echo "$SEC_TOKEN" ;;
    auditor) echo "$AUD_TOKEN" ;;
    *) echo "" ;;
  esac
}

step_expect_status() {
  local step_id="$1"
  jq -r --arg id "$step_id" '.steps[] | select(.id==$id) | .expect_status' "$MANIFEST"
}

path_with_vars() {
  local raw="$1"
  raw="${raw//\{platform_id\}/$PLATFORM_ID}"
  raw="${raw//\{account_id\}/$ACCOUNT_ID}"
  raw="${raw//\{credential_id\}/$CREDENTIAL_ID}"
  raw="${raw//\{assistant_id\}/$ASSISTANT_ID}"
  raw="${raw//\{export_id\}/$EXPORT_ID}"
  printf '%s' "$raw"
}

run_step() {
  local step_id="$1"
  local method="$2"
  local path_template="$3"
  local token_name="$4"
  local body_json="$5"

  local expect_status
  expect_status="$(step_expect_status "$step_id")"
  local path
  path="$(path_with_vars "$path_template")"
  local url="${API_BASE}${path}"
  local req_file="$CAPTURE_DIR/${step_id}.request.json"
  local resp_file="$CAPTURE_DIR/${step_id}.response.json"
  local status_file="$CAPTURE_DIR/${step_id}.status.txt"

  jq -n \
    --arg id "$step_id" \
    --arg method "$method" \
    --arg path "$path" \
    --arg url "$url" \
    --arg token "$token_name" \
    --arg body "$body_json" \
    '{step_id:$id, method:$method, path:$path, url:$url, token:$token, body:(if $body=="" then null else ($body|fromjson) end)}' > "$req_file"

  local curl_args=(
    -sS
    -o "$resp_file"
    -w "%{http_code}"
    -X "$method"
  )

  if [[ -n "$token_name" ]]; then
    local token
    token="$(token_value "$token_name")"
    if [[ -z "$token" ]]; then
      echo "unknown token name for step $step_id: $token_name" >&2
      exit 1
    fi
    curl_args+=(-H "Authorization: Bearer $token")
  fi

  if [[ -n "$body_json" ]]; then
    curl_args+=(-H "Content-Type: application/json" -d "$body_json")
  fi

  curl_args+=("$url")
  local status
  status="$(curl "${curl_args[@]}")"

  printf '%s\n' "$status" > "$status_file"
  assert_status "$step_id" "$status" "$expect_status"
}

extract_uuid_field() {
  local file="$1"
  local field="$2"
  jq -er --arg f "$field" '.[$f] | select(type=="string" and length>0)' "$file"
}

run_core_flow() {
  run_step "health" "GET" "/health" "" ""
  run_step "platforms_unauthorized" "GET" "/api/v1/platforms" "" ""
  run_step "create_platform" "POST" "/api/v1/platforms" "admin" '{"name":"OpenAI","type":"openai","config":{"base_url":"https://api.openai.com","auth_type":"api_key"}}'
  PLATFORM_ID="$(extract_uuid_field "$CAPTURE_DIR/create_platform.response.json" "id")"

  run_step "create_account" "POST" "/api/v1/accounts" "admin" "{\"platform_id\":\"$PLATFORM_ID\",\"display_name\":\"security-bot\"}"
  ACCOUNT_ID="$(extract_uuid_field "$CAPTURE_DIR/create_account.response.json" "id")"

  run_step "create_credential" "POST" "/api/v1/credentials" "security_ops" "{\"account_id\":\"$ACCOUNT_ID\",\"type\":\"api_key\",\"expires_at\":\"2027-12-31T00:00:00Z\"}"
  CREDENTIAL_ID="$(extract_uuid_field "$CAPTURE_DIR/create_credential.response.json" "id")"

  run_step "create_assistant" "POST" "/api/v1/assistants" "security_ops" '{"name":"ops-assistant","description":"security operations"}'
  ASSISTANT_ID="$(extract_uuid_field "$CAPTURE_DIR/create_assistant.response.json" "id")"

  run_step "bind_assistant" "POST" "/api/v1/assistants/{assistant_id}/bind" "security_ops" "{\"credential_id\":\"$CREDENTIAL_ID\",\"scope\":{\"resources\":[\"models\"],\"rate_limit\":\"1000/day\"}}"
  run_step "rotate_forbidden" "POST" "/api/v1/credentials/{credential_id}/rotate" "auditor" ""
  run_step "rotate_allowed" "POST" "/api/v1/credentials/{credential_id}/rotate" "security_ops" ""
  run_step "create_audit_export" "POST" "/api/v1/audit/exports" "auditor" '{"from":"2026-01-01T00:00:00Z","to":"2026-12-31T23:59:59Z","format":"csv"}'
  EXPORT_ID="$(extract_uuid_field "$CAPTURE_DIR/create_audit_export.response.json" "id")"
  run_step "list_audit" "GET" "/api/v1/audit" "auditor" ""
}

verify_audit_chain() {
  local audit_file="$CAPTURE_DIR/list_audit.response.json"

  local event_count required_fields_ok deny_event_count chain_link_ok
  event_count="$(jq '.items | length' "$audit_file")"
  required_fields_ok="$(jq '[.items[] | has("actor_id") and has("source") and has("decision") and has("event_hash")] | all' "$audit_file")"
  deny_event_count="$(jq '[.items[] | select(.decision=="deny")] | length' "$audit_file")"
  chain_link_ok="$(jq '(.items) as $items | ($items|length) as $n | if $n < 2 then true else ([range(1; $n) as $i | ($items[$i].prev_event_hash == $items[$i-1].event_hash)] | all) end' "$audit_file")"

  if [[ "$required_fields_ok" != "true" ]]; then
    echo "audit required fields check failed" >&2
    exit 1
  fi
  if [[ "$chain_link_ok" != "true" ]]; then
    echo "audit hash-chain linkage check failed" >&2
    exit 1
  fi
  if [[ "$deny_event_count" -lt 1 ]]; then
    echo "expected at least one deny audit event" >&2
    exit 1
  fi

  jq -n \
    --arg mode "$MODE" \
    --arg api_base "$API_BASE" \
    --arg platform_id "$PLATFORM_ID" \
    --arg account_id "$ACCOUNT_ID" \
    --arg credential_id "$CREDENTIAL_ID" \
    --arg assistant_id "$ASSISTANT_ID" \
    --arg export_id "$EXPORT_ID" \
    --argjson event_count "$event_count" \
    --argjson deny_event_count "$deny_event_count" \
    --argjson required_fields_ok "$required_fields_ok" \
    --argjson chain_link_ok "$chain_link_ok" \
    '{
      mode:$mode,
      api_base:$api_base,
      generated_at:(now | todate),
      ids:{
        platform_id:$platform_id,
        account_id:$account_id,
        credential_id:$credential_id,
        assistant_id:$assistant_id,
        export_id:$export_id
      },
      checks:{
        event_count:$event_count,
        deny_event_count:$deny_event_count,
        required_fields_ok:$required_fields_ok,
        chain_link_ok:$chain_link_ok
      }
    }' > "$REPORT_DIR/core_flow_summary.json"
}

publish_fixtures() {
  if [[ "$MODE" != "capture" ]]; then
    return
  fi

  local latest_dir="$FIXTURE_ROOT/latest"
  mkdir -p "$latest_dir"
  cp "$MANIFEST" "$latest_dir/manifest.json"
  cp "$REPORT_DIR/core_flow_summary.json" "$latest_dir/capture_summary.json"
  cp "$CAPTURE_DIR"/*.request.json "$latest_dir/" 2>/dev/null || true
  cp "$CAPTURE_DIR"/*.response.json "$latest_dir/" 2>/dev/null || true
  cp "$CAPTURE_DIR"/*.status.txt "$latest_dir/" 2>/dev/null || true
}

main() {
  start_real_api
  run_core_flow
  verify_audit_chain
  publish_fixtures

  jq -n \
    --arg mode "$MODE" \
    --arg evidence_dir "$EVIDENCE_DIR" \
    --arg manifest "$MANIFEST" \
    --arg acceptance_rule "$(jq -r '.acceptance_rule' "$MANIFEST")" \
    --slurpfile summary "$REPORT_DIR/core_flow_summary.json" \
    '{
      mode:$mode,
      evidence_dir:$evidence_dir,
      manifest:$manifest,
      acceptance_rule:$acceptance_rule,
      summary:$summary[0]
    }' > "$REPORT_DIR/run_report.json"

  echo "real_api_core_flow mode=$MODE success"
  echo "evidence=$EVIDENCE_DIR"
}

main
