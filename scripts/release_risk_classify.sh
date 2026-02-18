#!/usr/bin/env bash
set -euo pipefail

BASE=""
HEAD="HEAD"
PROJECT_DIR=""
OUTPUT=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/release_risk_classify.sh --base <sha> [--head <sha>] [--project-dir <path>] [--output <path>]

Classifies change risk into:
  - P0: high-risk auth/session/secret/permission/audit-export touching changes
  - P1: normal code/infra/script changes
  - P2: docs/evidence/meta-only changes
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
    --output)
      OUTPUT="$2"
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

if [[ -z "$OUTPUT" ]]; then
  OUTPUT="$PROJECT_DIR/outputs/release-gate/manual-risk-$(date -u +%Y%m%dT%H%M%SZ).json"
fi
mkdir -p "$(dirname "$OUTPUT")"

mapfile -t CHANGED_FILES < <(git diff --name-only "${BASE}..${HEAD}")

CODE_FILES=()
HIGH_RISK_SIGNALS=()

touches_backend=false
touches_console=false
touches_scripts=false
touches_infra=false

is_meta_only_path() {
  local p="$1"
  case "$p" in
    doc/*|outputs/*|postmortem/*|README.md|AGENTS.md|CLAUDE.md|CODEX.md|GEMINI.md|*.md|.sop_current_run_path)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

detect_high_risk_signal() {
  local p="$1"

  if [[ "$p" =~ ^services/api/internal/server/auth_ ]]; then
    HIGH_RISK_SIGNALS+=("auth-entrypoint:${p}")
  fi
  if [[ "$p" =~ ^services/api/internal/repository/audit ]]; then
    HIGH_RISK_SIGNALS+=("audit-chain:${p}")
  fi
  if [[ "$p" =~ ^services/api/internal/(service|server|repository|config)/.*(auth|session|secret|credential|permission|rbac|token|encrypt|kms|audit|export) ]]; then
    HIGH_RISK_SIGNALS+=("security-keyword:${p}")
  fi
  if [[ "$p" =~ ^apps/console/app/api/.*(auth|session|secret|credential|permission|rbac|token|audit|export) ]]; then
    HIGH_RISK_SIGNALS+=("console-api-security:${p}")
  fi
}

for f in "${CHANGED_FILES[@]}"; do
  [[ -n "$f" ]] || continue

  if [[ "$f" == services/api/* ]]; then
    touches_backend=true
  fi
  if [[ "$f" == apps/console/* ]]; then
    touches_console=true
  fi
  if [[ "$f" == scripts/* ]]; then
    touches_scripts=true
  fi
  if [[ "$f" == docker-compose.yml || "$f" == Makefile || "$f" == .github/* ]]; then
    touches_infra=true
  fi

  if is_meta_only_path "$f"; then
    continue
  fi

  CODE_FILES+=("$f")
  detect_high_risk_signal "$f"
done

risk_level="P2"
if [[ ${#CODE_FILES[@]} -gt 0 ]]; then
  if [[ ${#HIGH_RISK_SIGNALS[@]} -gt 0 ]]; then
    risk_level="P0"
  else
    risk_level="P1"
  fi
fi

changed_files_json="$(printf '%s\n' "${CHANGED_FILES[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')"
code_files_json="$(printf '%s\n' "${CODE_FILES[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')"
signals_json="$(printf '%s\n' "${HIGH_RISK_SIGNALS[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')"

jq -n \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg base "$BASE" \
  --arg head "$HEAD" \
  --arg risk_level "$risk_level" \
  --argjson changed_files "$changed_files_json" \
  --argjson code_files "$code_files_json" \
  --argjson high_risk_signals "$signals_json" \
  --argjson touches_backend "$touches_backend" \
  --argjson touches_console "$touches_console" \
  --argjson touches_scripts "$touches_scripts" \
  --argjson touches_infra "$touches_infra" \
  '{
    generated_at: $generated_at,
    base: $base,
    head: $head,
    risk_level: $risk_level,
    changed_files: $changed_files,
    code_files: $code_files,
    high_risk_signals: $high_risk_signals,
    touches_backend: $touches_backend,
    touches_console: $touches_console,
    touches_scripts: $touches_scripts,
    touches_infra: $touches_infra,
    doc_only: ($code_files | length == 0)
  }' > "$OUTPUT"

echo "risk_classification_output=$OUTPUT"
echo "risk_level=$risk_level"
