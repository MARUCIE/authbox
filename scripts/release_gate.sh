#!/usr/bin/env bash
set -euo pipefail

BASE=""
HEAD="HEAD"
PROJECT_DIR=""
SOP_ID="release-gate"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR=""
GATEKEEPER="${GATEKEEPER_SIGNOFF:-}"

usage() {
  cat <<'USAGE'
Usage:
  scripts/release_gate.sh --base <sha> [--head <sha>] [--project-dir <path>]
                          [--sop-id <id>] [--run-id <id>] [--evidence-dir <path>]
                          [--gatekeeper <name>]

Implements release gating with:
  - Risk classification (P0/P1/P2)
  - Layer A: automated checks
  - Layer B: evidence completeness + gatekeeper signoff (required for P0)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE="$2"
      shift 2
      ;;
    --head)
      HEAD="$2"
      shift 2
      ;;
    --project-dir)
      PROJECT_DIR="$2"
      shift 2
      ;;
    --sop-id)
      SOP_ID="$2"
      shift 2
      ;;
    --run-id)
      RUN_ID="$2"
      shift 2
      ;;
    --evidence-dir)
      EVIDENCE_DIR="$2"
      shift 2
      ;;
    --gatekeeper)
      GATEKEEPER="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$PROJECT_DIR" ]]; then
  PROJECT_DIR="$(git rev-parse --show-toplevel)"
fi
cd "$PROJECT_DIR"

if [[ -z "$BASE" ]]; then
  if git rev-parse HEAD~1 >/dev/null 2>&1; then
    BASE="$(git rev-parse HEAD~1)"
  else
    BASE="$(git rev-parse HEAD)"
  fi
fi

if [[ -z "$EVIDENCE_DIR" ]]; then
  EVIDENCE_DIR="$PROJECT_DIR/outputs/$SOP_ID/$RUN_ID"
fi

LOG_DIR="$EVIDENCE_DIR/logs"
REPORT_DIR="$EVIDENCE_DIR/reports"
mkdir -p "$LOG_DIR" "$REPORT_DIR"

RISK_JSON="$REPORT_DIR/risk_assessment.json"
LAYER_A_JSON="$REPORT_DIR/layer_a_results.json"
LAYER_B_JSON="$REPORT_DIR/layer_b_results.json"
SUMMARY_JSON="$REPORT_DIR/release_gate_summary.json"

scripts/release_risk_classify.sh \
  --base "$BASE" \
  --head "$HEAD" \
  --project-dir "$PROJECT_DIR" \
  --output "$RISK_JSON" \
  | tee "$LOG_DIR/risk_classify.log"

RISK_LEVEL="$(jq -r '.risk_level' "$RISK_JSON")"
TOUCHES_BACKEND="$(jq -r '.touches_backend' "$RISK_JSON")"
TOUCHES_CONSOLE="$(jq -r '.touches_console' "$RISK_JSON")"

CHECKS_NDJSON="$(mktemp)"
trap 'rm -f "$CHECKS_NDJSON"' EXIT

append_result() {
  local name="$1"
  local status="$2"
  local exit_code="$3"
  local log_path="$4"
  local note="$5"

  jq -n \
    --arg name "$name" \
    --arg status "$status" \
    --argjson exit_code "$exit_code" \
    --arg log_path "$log_path" \
    --arg note "$note" \
    '{name:$name,status:$status,exit_code:$exit_code,log_path:$log_path,note:$note}' \
    >> "$CHECKS_NDJSON"
}

run_check() {
  local name="$1"
  shift
  local log_path="$LOG_DIR/layer_a_${name}.log"

  set +e
  "$@" 2>&1 | tee "$log_path"
  local exit_code=${PIPESTATUS[0]}
  set -e

  if [[ $exit_code -eq 0 ]]; then
    append_result "$name" "PASS" "$exit_code" "$log_path" ""
  else
    append_result "$name" "FAIL" "$exit_code" "$log_path" "command_failed"
  fi
}

run_npm_audit_check() {
  local name="console_security_audit"
  local log_path="$LOG_DIR/layer_a_${name}.log"
  local audit_json="$REPORT_DIR/npm_audit.json"

  set +e
  npm --prefix apps/console audit --json --omit=dev > "$audit_json" 2> "$log_path"
  local exit_code=$?
  set -e

  local critical high total
  critical="$(jq -r '.metadata.vulnerabilities.critical // 0' "$audit_json")"
  high="$(jq -r '.metadata.vulnerabilities.high // 0' "$audit_json")"
  total="$(jq -r '.metadata.vulnerabilities.total // 0' "$audit_json")"

  local note="critical=${critical},high=${high},total=${total}"
  echo "$note" | tee -a "$log_path"

  local status="PASS"
  if [[ "$RISK_LEVEL" == "P0" || "$RISK_LEVEL" == "P1" ]]; then
    if (( critical > 0 )); then
      status="FAIL"
    fi
  fi

  if [[ "$status" == "PASS" ]]; then
    append_result "$name" "PASS" "$exit_code" "$log_path" "$note"
  else
    append_result "$name" "FAIL" "$exit_code" "$log_path" "$note"
  fi
}

echo "Layer A start: risk_level=$RISK_LEVEL" | tee "$LOG_DIR/layer_a_start.log"

run_check "postmortem_scan" scripts/postmortem_scan.sh --base "$BASE" --head "$HEAD"

if [[ "$TOUCHES_BACKEND" == "true" || "$RISK_LEVEL" == "P0" ]]; then
  run_check "backend_tests" bash -lc "cd services/api && go test ./..."
fi

if [[ "$TOUCHES_CONSOLE" == "true" || "$RISK_LEVEL" == "P0" ]]; then
  run_check "console_install" npm --prefix apps/console ci --no-audit --no-fund
  run_check "console_build" npm --prefix apps/console run build
  run_npm_audit_check
fi

if command -v ai >/dev/null 2>&1; then
  run_check "ai_check" ai check --no-sbom
else
  append_result "ai_check" "SKIP" 0 "" "ai_command_not_found"
fi

jq -s '{checks: ., pass: all(.[]; .status == "PASS" or .status == "SKIP")}' "$CHECKS_NDJSON" > "$LAYER_A_JSON"

LAYER_A_PASS="$(jq -r '.pass' "$LAYER_A_JSON")"

required_files=(
  "$RISK_JSON"
  "$LAYER_A_JSON"
)

if [[ -f "$REPORT_DIR/npm_audit.json" ]]; then
  required_files+=("$REPORT_DIR/npm_audit.json")
fi

missing_count=0
for req in "${required_files[@]}"; do
  if [[ ! -f "$req" ]]; then
    missing_count=$((missing_count + 1))
  fi
done

gatekeeper_required=false
gatekeeper_ok=true
if [[ "$RISK_LEVEL" == "P0" ]]; then
  gatekeeper_required=true
  if [[ -z "$GATEKEEPER" ]]; then
    gatekeeper_ok=false
  fi
fi

evidence_complete=true
if [[ $missing_count -ne 0 ]]; then
  evidence_complete=false
fi

layer_b_pass=false
if [[ "$LAYER_A_PASS" == "true" && "$evidence_complete" == "true" && "$gatekeeper_ok" == "true" ]]; then
  layer_b_pass=true
fi

required_json="$(printf '%s\n' "${required_files[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')"

jq -n \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg risk_level "$RISK_LEVEL" \
  --argjson layer_a_pass "$LAYER_A_PASS" \
  --argjson gatekeeper_required "$gatekeeper_required" \
  --arg gatekeeper "$GATEKEEPER" \
  --argjson gatekeeper_ok "$gatekeeper_ok" \
  --argjson evidence_complete "$evidence_complete" \
  --argjson missing_count "$missing_count" \
  --argjson required_files "$required_json" \
  --argjson pass "$layer_b_pass" \
  '{
    generated_at:$generated_at,
    risk_level:$risk_level,
    layer_a_pass:$layer_a_pass,
    gatekeeper_required:$gatekeeper_required,
    gatekeeper:$gatekeeper,
    gatekeeper_ok:$gatekeeper_ok,
    evidence_complete:$evidence_complete,
    missing_count:$missing_count,
    required_files:$required_files,
    pass:$pass
  }' > "$LAYER_B_JSON"

overall_pass="$layer_b_pass"

jq -n \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg base "$BASE" \
  --arg head "$HEAD" \
  --arg risk_level "$RISK_LEVEL" \
  --arg evidence_dir "$EVIDENCE_DIR" \
  --arg risk_report "$RISK_JSON" \
  --arg layer_a_report "$LAYER_A_JSON" \
  --arg layer_b_report "$LAYER_B_JSON" \
  --argjson pass "$overall_pass" \
  '{
    generated_at:$generated_at,
    base:$base,
    head:$head,
    risk_level:$risk_level,
    evidence_dir:$evidence_dir,
    risk_report:$risk_report,
    layer_a_report:$layer_a_report,
    layer_b_report:$layer_b_report,
    pass:$pass
  }' > "$SUMMARY_JSON"

echo "release_gate_summary=$SUMMARY_JSON"
echo "release_gate_pass=$overall_pass"

if [[ "$overall_pass" != "true" ]]; then
  exit 1
fi
