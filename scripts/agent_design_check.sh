#!/usr/bin/env bash
set -euo pipefail

CONFIG="configs/agent-router/professional-agent-routing.v1.json"
PRD_DOC="doc/00_project/initiative_10_auth_box/PRD.md"
UXMAP_DOC="doc/00_project/initiative_10_auth_box/USER_EXPERIENCE_MAP.md"
DESIGN_DOC="doc/00_project/initiative_10_auth_box/AGENT_PROFESSIONAL_DESIGN.md"
OUTPUT=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/agent_design_check.sh [--config <path>] [--prd <path>] [--uxmap <path>] [--design-doc <path>] [--output <path>]

Checks routing config structure and doc consistency for professional agent design.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG="$2"
      shift 2
      ;;
    --prd)
      PRD_DOC="$2"
      shift 2
      ;;
    --uxmap)
      UXMAP_DOC="$2"
      shift 2
      ;;
    --design-doc)
      DESIGN_DOC="$2"
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

if [[ -z "$OUTPUT" ]]; then
  OUTPUT="outputs/agent-design-check/manual-$(date -u +%Y%m%dT%H%M%SZ).json"
fi
mkdir -p "$(dirname "$OUTPUT")"

CHECKS_NDJSON="$(mktemp)"
trap 'rm -f "$CHECKS_NDJSON"' EXIT

append_check() {
  local name="$1"
  local status="$2"
  local note="$3"

  jq -n --arg name "$name" --arg status "$status" --arg note "$note" \
    '{name:$name,status:$status,note:$note}' >> "$CHECKS_NDJSON"
}

check_cmd() {
  local name="$1"
  local note="$2"
  shift 2
  if "$@" >/dev/null 2>&1; then
    append_check "$name" "PASS" "$note"
  else
    append_check "$name" "FAIL" "$note"
  fi
}

check_cmd "config_exists" "routing config exists" test -f "$CONFIG"
check_cmd "config_json_valid" "routing config is valid json" jq empty "$CONFIG"

check_cmd "config_has_core_fields" "version/personas/trigger_rules/defaults/acceptance_gates present" \
  jq -e '.version and .personas and .trigger_rules and .defaults and .acceptance_gates' "$CONFIG"

check_cmd "persona_count" "at least 4 personas" \
  jq -e '(.personas | length) >= 4' "$CONFIG"

check_cmd "trigger_rule_count" "at least 5 trigger rules" \
  jq -e '(.trigger_rules | length) >= 5' "$CONFIG"

check_cmd "persona_ids_unique" "persona ids are unique" \
  jq -e '(.personas | map(.id) | unique | length) == (.personas | length)' "$CONFIG"

check_cmd "required_personas_present" "leader/researcher/builder/watchdog present" \
  jq -e '(["agent_leader","agent_researcher","agent_builder","agent_watchdog"] - (.personas | map(.id))) | length == 0' "$CONFIG"

check_cmd "trigger_rules_have_workflow_router" "all trigger rules include workflow-router" \
  jq -e 'all(.trigger_rules[]; (.skills | index("workflow-router")) != null)' "$CONFIG"

check_cmd "planning_mode_has_planning_skill" "planning-with-files mode includes planning skill" \
  jq -e 'all(.trigger_rules[] | select(.mode=="planning-with-files"); (.skills | index("planning-with-files")) != null)' "$CONFIG"

check_cmd "defaults_skill_priority" "skill priority is skill>plugin>mcp>manual" \
  jq -e '.defaults.skill_priority == ["skill","plugin","mcp","manual"]' "$CONFIG"

check_cmd "prd_section_present" "PRD contains agent design SOP section" \
  grep -Fq "## SOP：专业智能体设计（2026-02-18）" "$PRD_DOC"

check_cmd "uxmap_journey_present" "UXMap contains Journey I" \
  grep -Fq "## Journey I: 专业智能体执行闭环（新增，2026-02-18）" "$UXMAP_DOC"

check_cmd "design_doc_present" "design doc has expected title" \
  grep -Fq "# Professional Agent Design (SOP)" "$DESIGN_DOC"

jq -s \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg config "$CONFIG" \
  --arg prd "$PRD_DOC" \
  --arg uxmap "$UXMAP_DOC" \
  --arg design_doc "$DESIGN_DOC" \
  '{
    generated_at:$generated_at,
    config:$config,
    prd:$prd,
    uxmap:$uxmap,
    design_doc:$design_doc,
    checks: .,
    pass: all(.[]; .status == "PASS")
  }' "$CHECKS_NDJSON" > "$OUTPUT"

PASS_VALUE="$(jq -r '.pass' "$OUTPUT")"
echo "agent_design_check_output=$OUTPUT"
echo "agent_design_check_pass=$PASS_VALUE"

if [[ "$PASS_VALUE" != "true" ]]; then
  exit 1
fi
