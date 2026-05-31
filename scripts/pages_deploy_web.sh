#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
LOCAL_OUT_DIR="${LOCAL_OUT_DIR:-$WEB_DIR/out}"
PAGES_PROJECT_NAME="${PAGES_PROJECT_NAME:-authbox}"
PAGES_BRANCH="${PAGES_BRANCH:-main}"
LIVE_BASE_URL="${LIVE_BASE_URL:-https://authbox.io}"
ROUTE="${ROUTE:-/login}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/outputs/pages-deploy/$RUN_ID}"
REPORT_DIR="$OUTPUT_DIR/reports"
LOG_DIR="$OUTPUT_DIR/logs"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_LOCAL_SMOKE="${SKIP_LOCAL_SMOKE:-0}"
SKIP_DEPLOY="${SKIP_DEPLOY:-0}"
LIVE_SMOKE="${LIVE_SMOKE:-0}"

mkdir -p "$REPORT_DIR" "$LOG_DIR"

COMMIT_HASH="${COMMIT_HASH:-$(git -C "$ROOT_DIR" rev-parse HEAD)}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-$(git -C "$ROOT_DIR" log -1 --pretty=%s HEAD)}"

cat <<EOF | tee "$REPORT_DIR/pages_deploy_context.txt"
run_id=$RUN_ID
root_dir=$ROOT_DIR
web_dir=$WEB_DIR
local_out_dir=$LOCAL_OUT_DIR
pages_project_name=$PAGES_PROJECT_NAME
pages_branch=$PAGES_BRANCH
route=$ROUTE
live_base_url=$LIVE_BASE_URL
commit_hash=$COMMIT_HASH
commit_message=$COMMIT_MESSAGE
skip_build=$SKIP_BUILD
skip_local_smoke=$SKIP_LOCAL_SMOKE
skip_deploy=$SKIP_DEPLOY
live_smoke=$LIVE_SMOKE
EOF

if [ "$SKIP_BUILD" != "1" ]; then
  pnpm --filter @authbox/web build 2>&1 | tee "$LOG_DIR/web_build.log"
fi

if [ ! -d "$LOCAL_OUT_DIR" ]; then
  echo "ERROR: local export directory not found: $LOCAL_OUT_DIR" >&2
  exit 2
fi

if [ "$SKIP_LOCAL_SMOKE" != "1" ]; then
  node "$ROOT_DIR/scripts/public_bundle_smoke.mjs" \
    --mode local \
    --route "$ROUTE" \
    --local-out-dir "$LOCAL_OUT_DIR" \
    --output "$REPORT_DIR/public_bundle_local.json" \
    2>&1 | tee "$LOG_DIR/public_bundle_local.log"
fi

WRANGLER_CMD=(
  wrangler
  pages
  deploy
  "$LOCAL_OUT_DIR"
  --project-name
  "$PAGES_PROJECT_NAME"
  --branch
  "$PAGES_BRANCH"
  --commit-hash
  "$COMMIT_HASH"
  --commit-message
  "$COMMIT_MESSAGE"
  --commit-dirty
)

printf '%q ' "${WRANGLER_CMD[@]}" > "$REPORT_DIR/wrangler_pages_deploy_cmd.sh"
printf '\n' >> "$REPORT_DIR/wrangler_pages_deploy_cmd.sh"

if [ "$SKIP_DEPLOY" = "1" ]; then
  echo "Skipping Cloudflare Pages deploy because SKIP_DEPLOY=1." | tee "$LOG_DIR/wrangler_pages_deploy.log"
  exit 0
fi

PAGES_AUTH_RUN_ID="$RUN_ID" OUTPUT_DIR="$OUTPUT_DIR/auth-check" PAGES_PROJECT_NAME="$PAGES_PROJECT_NAME" \
  "$ROOT_DIR/scripts/pages_auth_check.sh" 2>&1 | tee "$LOG_DIR/pages_auth_check.log"

(cd "$WEB_DIR" && "${WRANGLER_CMD[@]}") 2>&1 | tee "$LOG_DIR/wrangler_pages_deploy.log"

if [ "$LIVE_SMOKE" = "1" ]; then
  node "$ROOT_DIR/scripts/public_bundle_smoke.mjs" \
    --mode live \
    --route "$ROUTE" \
    --live-base-url "$LIVE_BASE_URL" \
    --output "$REPORT_DIR/public_bundle_live.json" \
    2>&1 | tee "$LOG_DIR/public_bundle_live.log"
fi
