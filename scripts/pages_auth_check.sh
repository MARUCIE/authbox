#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
PAGES_PROJECT_NAME="${PAGES_PROJECT_NAME:-authbox}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/outputs/pages-auth-check/$RUN_ID}"
REPORT_DIR="$OUTPUT_DIR/reports"
LOG_DIR="$OUTPUT_DIR/logs"

mkdir -p "$REPORT_DIR" "$LOG_DIR"

AUTH_MODE="oauth"
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  AUTH_MODE="api_token"
fi

cat <<EOF | tee "$REPORT_DIR/pages_auth_check_context.txt"
run_id=$RUN_ID
root_dir=$ROOT_DIR
web_dir=$WEB_DIR
pages_project_name=$PAGES_PROJECT_NAME
auth_mode=$AUTH_MODE
EOF

set +e
(cd "$WEB_DIR" && wrangler pages deployment list --project-name "$PAGES_PROJECT_NAME") \
  >"$LOG_DIR/wrangler_pages_deployment_list.log" 2>&1
STATUS=$?
set -e

if [ "$STATUS" -eq 0 ]; then
  cat <<EOF | tee "$REPORT_DIR/pages_auth_check_result.txt"
status=pass
reason=wrangler_pages_deployment_list_succeeded
log=$LOG_DIR/wrangler_pages_deployment_list.log
EOF
  cat "$LOG_DIR/wrangler_pages_deployment_list.log"
  exit 0
fi

REASON="wrangler_auth_failed"
if grep -qi "bot challenge" "$LOG_DIR/wrangler_pages_deployment_list.log"; then
  REASON="cloudflare_bot_challenge"
elif grep -qi "CLOUDFLARE_API_TOKEN" "$LOG_DIR/wrangler_pages_deployment_list.log"; then
  REASON="missing_or_invalid_cloudflare_api_token"
elif grep -qi "Authentication error" "$LOG_DIR/wrangler_pages_deployment_list.log"; then
  REASON="authentication_error"
fi

cat <<EOF | tee "$REPORT_DIR/pages_auth_check_result.txt"
status=fail
reason=$REASON
log=$LOG_DIR/wrangler_pages_deployment_list.log
hint=Provide a valid CLOUDFLARE_API_TOKEN or restore interactive Wrangler auth, then rerun make pages-auth-check.
EOF

cat "$LOG_DIR/wrangler_pages_deployment_list.log"
exit "$STATUS"
