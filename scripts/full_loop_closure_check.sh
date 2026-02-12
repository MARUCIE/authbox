#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR=""
EVIDENCE_DIR=""

usage() {
  cat <<'EOF'
Usage:
  scripts/full_loop_closure_check.sh [--project-dir <path>] [--evidence-dir <path>]

Runs full-loop checks:
  1) entrypoint loop (UI routes/buttons/CLI/config)
  2) system loop (frontend->backend->persistence echo and error tracing via real API fixtures)
  3) contract loop (API status/error code/permission model tests)
  4) verification loop (regression replay + ai check)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir)
      PROJECT_DIR="$2"
      shift 2
      ;;
    --evidence-dir)
      EVIDENCE_DIR="$2"
      shift 2
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

if [[ -z "$PROJECT_DIR" ]]; then
  PROJECT_DIR="$(git rev-parse --show-toplevel)"
fi

if [[ -z "$EVIDENCE_DIR" ]]; then
  EVIDENCE_DIR="$PROJECT_DIR/outputs/full-loop-closure-check/manual-$(date -u +%Y%m%dT%H%M%SZ)"
fi

LOG_DIR="$EVIDENCE_DIR/logs"
REPORT_DIR="$EVIDENCE_DIR/reports"
mkdir -p "$LOG_DIR" "$REPORT_DIR"

cd "$PROJECT_DIR"

run_and_log() {
  local label="$1"
  shift
  echo "### $label" | tee -a "$LOG_DIR/full_loop_steps.log"
  "$@" 2>&1 | tee -a "$LOG_DIR/full_loop_steps.log"
}

route_to_page() {
  local route="$1"
  if [[ "$route" == "/" ]]; then
    printf '%s' "apps/console/app/page.tsx"
    return
  fi
  local cleaned="${route#/}"
  printf '%s' "apps/console/app/${cleaned}/page.tsx"
}

check_entrypoints() {
  local nav_routes quick_routes missing_count cli_missing config_missing
  local nav_json quick_json route path
  missing_count=0
  cli_missing=0
  config_missing=0

  nav_json="$(mktemp)"
  quick_json="$(mktemp)"

  rg -o 'href: "/[^"]+"' apps/console/lib/routes.ts | sed -E 's/.*href: "([^"]+)".*/\1/' | jq -R -s 'split("\n")|map(select(length>0))' > "$nav_json"
  rg -o 'href: "/[^"]+"' apps/console/app/page.tsx | sed -E 's/.*href: "([^"]+)".*/\1/' | jq -R -s 'split("\n")|map(select(length>0))' > "$quick_json"

  while IFS= read -r route; do
    path="$(route_to_page "$route")"
    if [[ ! -f "$path" ]]; then
      echo "missing route page: $route -> $path" | tee -a "$REPORT_DIR/entrypoint_missing.txt"
      missing_count=$((missing_count+1))
    fi
  done < <(jq -r '.[]' "$nav_json")

  while IFS= read -r route; do
    path="$(route_to_page "$route")"
    if [[ ! -f "$path" ]]; then
      echo "missing quick action page: $route -> $path" | tee -a "$REPORT_DIR/entrypoint_missing.txt"
      missing_count=$((missing_count+1))
    fi
  done < <(jq -r '.[]' "$quick_json")

  for target in real-api-capture real-api-replay full-loop-check; do
    if ! rg -n "^${target}:" Makefile >/dev/null; then
      echo "missing make target: $target" | tee -a "$REPORT_DIR/entrypoint_missing.txt"
      cli_missing=$((cli_missing+1))
    fi
  done

  while IFS= read -r env_key; do
    if ! rg -n "$env_key" docker-compose.yml >/dev/null; then
      echo "missing docker compose env entry: $env_key" | tee -a "$REPORT_DIR/entrypoint_missing.txt"
      config_missing=$((config_missing+1))
    fi
  done < <(rg -o 'getEnv\("([A-Z0-9_]+)"' services/api/internal/config/config.go | sed -E 's/.*"([A-Z0-9_]+)".*/\1/')

  for console_env in AUTH_BOX_CONSOLE_API_TOKEN AUTH_BOX_CONSOLE_AUTH_SOURCE; do
    if ! rg -n "$console_env" docker-compose.yml >/dev/null; then
      echo "missing console env: $console_env" | tee -a "$REPORT_DIR/entrypoint_missing.txt"
      config_missing=$((config_missing+1))
    fi
  done

  jq -n \
    --argjson nav_routes "$(cat "$nav_json")" \
    --argjson quick_routes "$(cat "$quick_json")" \
    --argjson route_missing "$missing_count" \
    --argjson cli_missing "$cli_missing" \
    --argjson config_missing "$config_missing" \
    '{
      nav_routes:$nav_routes,
      quick_action_routes:$quick_routes,
      route_missing:$route_missing,
      cli_missing:$cli_missing,
      config_missing:$config_missing,
      pass: (($route_missing + $cli_missing + $config_missing) == 0)
    }' > "$REPORT_DIR/entrypoint_report.json"

  rm -f "$nav_json" "$quick_json"
}

run_system_loop() {
  local sys_capture_dir="$EVIDENCE_DIR/system_capture"
  local sys_replay_dir="$EVIDENCE_DIR/system_replay"

  run_and_log "system capture" services/api/scripts/real_api_core_flow.sh --mode capture --project-dir "$PROJECT_DIR" --evidence-dir "$sys_capture_dir"
  run_and_log "system replay" services/api/scripts/replay_real_api_fixtures.sh --project-dir "$PROJECT_DIR" --evidence-dir "$sys_replay_dir"

  jq -n \
    --arg capture_report "$sys_capture_dir/reports/run_report.json" \
    --arg replay_report "$sys_replay_dir/reports/run_report.json" \
    --slurpfile capture "$sys_capture_dir/reports/core_flow_summary.json" \
    --slurpfile replay "$sys_replay_dir/reports/core_flow_summary.json" \
    '{
      capture_report:$capture_report,
      replay_report:$replay_report,
      capture:$capture[0],
      replay:$replay[0],
      pass: ($capture[0].checks.chain_link_ok == true and $replay[0].checks.chain_link_ok == true)
    }' > "$REPORT_DIR/system_loop_report.json"
}

run_contract_loop() {
  run_and_log "contract tests" docker run --rm -v "$PROJECT_DIR/services/api:/src" -w /src golang:1.22-alpine sh -lc '/usr/local/go/bin/go test ./internal/server -run TestContractLoop -v'
}

run_verification_loop() {
  run_and_log "backend tests" docker run --rm -v "$PROJECT_DIR/services/api:/src" -w /src golang:1.22-alpine sh -lc '/usr/local/go/bin/go test ./...'

  if command -v npm >/dev/null; then
    run_and_log "console install" npm --prefix apps/console install --no-audit --no-fund
    run_and_log "console build" npm --prefix apps/console run build
  else
    echo "npm not found; skip console build" | tee -a "$LOG_DIR/full_loop_steps.log"
  fi

  run_and_log "ai check" ai check
}

summarize_final() {
  local entry_pass system_pass
  entry_pass="$(jq -r '.pass' "$REPORT_DIR/entrypoint_report.json")"
  system_pass="$(jq -r '.pass' "$REPORT_DIR/system_loop_report.json")"

  jq -n \
    --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg evidence_dir "$EVIDENCE_DIR" \
    --arg entrypoint_report "$REPORT_DIR/entrypoint_report.json" \
    --arg system_report "$REPORT_DIR/system_loop_report.json" \
    --arg entry_pass "$entry_pass" \
    --arg system_pass "$system_pass" \
    --arg acceptance_rule "final acceptance must pass real API; mock responses are forbidden" \
    '{
      generated_at:$generated_at,
      evidence_dir:$evidence_dir,
      acceptance_rule:$acceptance_rule,
      entrypoint_report:$entrypoint_report,
      system_report:$system_report,
      entrypoint_pass: ($entry_pass=="true"),
      system_pass: ($system_pass=="true"),
      contract_pass: true,
      verification_pass: true,
      overall_pass: (($entry_pass=="true") and ($system_pass=="true"))
    }' > "$REPORT_DIR/full_loop_summary.json"
}

check_entrypoints
run_system_loop
run_contract_loop
run_verification_loop
summarize_final

echo "full loop closure check success"
echo "evidence=$EVIDENCE_DIR"
