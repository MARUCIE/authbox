#!/usr/bin/env bash
set -euo pipefail

TEXT=""
CONFIG="configs/agent-router/professional-agent-routing.v1.json"
OUTPUT=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/agent_router_decide.sh --text "<task text>" [--config <path>] [--output <path>]

Returns routing decision from trigger rules.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --text)
      TEXT="$2"
      shift 2
      ;;
    --config)
      CONFIG="$2"
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

if [[ -z "$TEXT" ]]; then
  echo "ERROR: --text is required" >&2
  exit 2
fi

if [[ ! -f "$CONFIG" ]]; then
  echo "ERROR: config not found: $CONFIG" >&2
  exit 2
fi

jq empty "$CONFIG" >/dev/null

TEXT_LOWER="$(printf '%s' "$TEXT" | tr '[:upper:]' '[:lower:]')"

matched_rule_id=""
matched_keyword=""

while IFS=$'\t' read -r rule_id keyword; do
  [[ -n "$rule_id" ]] || continue
  k_lower="$(printf '%s' "$keyword" | tr '[:upper:]' '[:lower:]')"
  if [[ "$TEXT_LOWER" == *"$k_lower"* ]]; then
    matched_rule_id="$rule_id"
    matched_keyword="$keyword"
    break
  fi
done < <(jq -r '.trigger_rules[] as $r | $r.keywords[] | [$r.id, .] | @tsv' "$CONFIG")

if [[ -n "$matched_rule_id" ]]; then
  decision_json="$(jq -n \
    --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg text "$TEXT" \
    --arg keyword "$matched_keyword" \
    --argjson rule "$(jq --arg id "$matched_rule_id" '.trigger_rules[] | select(.id == $id)' "$CONFIG")" \
    '{
      generated_at: $generated_at,
      matched: true,
      input_text: $text,
      matched_keyword: $keyword,
      rule: $rule,
      scenario: $rule.scenario,
      scope: $rule.scope,
      mode: $rule.mode,
      team_mode: $rule.team_mode,
      skills: $rule.skills
    }'
  )"
else
  decision_json="$(jq -n \
    --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg text "$TEXT" \
    --arg mode "$(jq -r '.defaults.mode' "$CONFIG")" \
    --arg team_mode "$(jq -r '.defaults.team_mode' "$CONFIG")" \
    --argjson fallback_skills '["workflow-router", "planning-with-files"]' \
    '{
      generated_at: $generated_at,
      matched: false,
      input_text: $text,
      matched_keyword: null,
      rule: null,
      scenario: "default",
      scope: "project",
      mode: $mode,
      team_mode: $team_mode,
      skills: $fallback_skills
    }'
  )"
fi

if [[ -n "$OUTPUT" ]]; then
  mkdir -p "$(dirname "$OUTPUT")"
  printf '%s\n' "$decision_json" > "$OUTPUT"
  echo "route_decision_output=$OUTPUT"
fi

printf '%s\n' "$decision_json"
