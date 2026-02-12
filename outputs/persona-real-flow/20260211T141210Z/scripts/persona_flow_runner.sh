#!/usr/bin/env bash
set -u -o pipefail

MODE="${1:-strict}"
OUT_DIR="${2:-.}"
API_BASE="${API_BASE:-http://localhost:14010}"
CONSOLE_BASE="${CONSOLE_BASE:-http://localhost:3010}"

mkdir -p "$OUT_DIR/logs" "$OUT_DIR/reports" "$OUT_DIR/data" "$OUT_DIR/screenshots"

HTTP_CODE=""

now_utc() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

http_call() {
  local method="$1"
  local url="$2"
  local body_file="$3"
  local payload_file="${4:-}"

  if [ -n "$payload_file" ] && [ -f "$payload_file" ]; then
    HTTP_CODE=$(curl -sS -o "$body_file" -w "%{http_code}" -X "$method" -H "Content-Type: application/json" --data "@$payload_file" "$url")
  else
    HTTP_CODE=$(curl -sS -o "$body_file" -w "%{http_code}" -X "$method" "$url")
  fi
}

expect_code() {
  local code="$1"
  local expected_csv="$2"
  IFS=',' read -r -a arr <<< "$expected_csv"
  for e in "${arr[@]}"; do
    if [ "$code" = "$e" ]; then
      return 0
    fi
  done
  return 1
}

capture_page_artifact() {
  local persona="$1"
  local page_slug="$2"
  local url="$3"
  local shot="$OUT_DIR/screenshots/${persona}_${page_slug}.png"
  local html="$OUT_DIR/screenshots/${persona}_${page_slug}.html"

  if npx playwright screenshot "$url" "$shot" >/dev/null 2>&1; then
    echo "screenshot_ok:$shot"
    return 0
  fi

  curl -sS "$url" > "$html" || true
  echo "screenshot_fallback_html:$html"
  return 0
}

record_step() {
  local file="$1"
  local persona="$2"
  local step="$3"
  local expected="$4"
  local actual="$5"
  local status="$6"
  local note="$7"
  printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$(now_utc)" "$persona" "$step" "$expected" "$actual" "$status" "$note" >> "$file"
}

get_expectation() {
  local domain="$1"
  case "$domain" in
    implemented_api) echo "200,201,204" ;;
    planned_api) echo "200,201,202,204" ;;
    console_page) echo "200" ;;
    *) echo "200" ;;
  esac
}

persona_p1_platform_admin() {
  local persona="P1_PLATFORM_ADMIN"
  local steps="$OUT_DIR/reports/${persona}_steps.tsv"
  : > "$steps"

  local total=0 pass=0 fail=0
  local body="$OUT_DIR/data/${persona}_body.json"
  local platform_payload="$OUT_DIR/data/${persona}_create_platform.json"
  local platform_update_payload="$OUT_DIR/data/${persona}_update_platform.json"
  local account_payload="$OUT_DIR/data/${persona}_create_account.json"
  local account_update_payload="$OUT_DIR/data/${persona}_update_account.json"

  cat > "$platform_payload" <<JSON
{"name":"OpenAI","type":"openai","config":{"base_url":"https://api.openai.com","auth_type":"api_key"}}
JSON

  cat > "$platform_update_payload" <<JSON
{"status":"inactive"}
JSON

  cat > "$account_update_payload" <<JSON
{"status":"suspended"}
JSON

  total=$((total+1))
  http_call GET "$CONSOLE_BASE/platforms/new" "$body"
  if expect_code "$HTTP_CODE" "$(get_expectation console_page)"; then
    pass=$((pass+1)); record_step "$steps" "$persona" "entry_platforms_new" "$(get_expectation console_page)" "$HTTP_CODE" "PASS" "console reachable"
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "entry_platforms_new" "$(get_expectation console_page)" "$HTTP_CODE" "FAIL" "console unavailable"
  fi
  capture_page_artifact "$persona" "platforms_new" "$CONSOLE_BASE/platforms/new" >> "$OUT_DIR/logs/${persona}.log" 2>&1

  total=$((total+1))
  http_call POST "$API_BASE/api/v1/platforms" "$body" "$platform_payload"
  local platform_id=""
  platform_id=$(jq -r '.id // empty' "$body")
  if expect_code "$HTTP_CODE" "$(get_expectation implemented_api)" && [ -n "$platform_id" ]; then
    pass=$((pass+1)); record_step "$steps" "$persona" "create_platform" "$(get_expectation implemented_api)" "$HTTP_CODE" "PASS" "platform_id=$platform_id"
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "create_platform" "$(get_expectation implemented_api)" "$HTTP_CODE" "FAIL" "body=$(cat "$body")"
  fi

  total=$((total+1))
  http_call GET "$API_BASE/api/v1/platforms" "$body"
  if expect_code "$HTTP_CODE" "$(get_expectation implemented_api)"; then
    pass=$((pass+1)); record_step "$steps" "$persona" "list_platforms" "$(get_expectation implemented_api)" "$HTTP_CODE" "PASS" ""
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "list_platforms" "$(get_expectation implemented_api)" "$HTTP_CODE" "FAIL" ""
  fi

  if [ -n "$platform_id" ]; then
    total=$((total+1))
    http_call PATCH "$API_BASE/api/v1/platforms/$platform_id" "$body" "$platform_update_payload"
    if expect_code "$HTTP_CODE" "$(get_expectation implemented_api)"; then
      pass=$((pass+1)); record_step "$steps" "$persona" "update_platform" "$(get_expectation implemented_api)" "$HTTP_CODE" "PASS" ""
    else
      fail=$((fail+1)); record_step "$steps" "$persona" "update_platform" "$(get_expectation implemented_api)" "$HTTP_CODE" "FAIL" ""
    fi

    cat > "$account_payload" <<JSON
{"platform_id":"$platform_id","display_name":"finance-bot"}
JSON

    total=$((total+1))
    http_call POST "$API_BASE/api/v1/accounts" "$body" "$account_payload"
    local account_id=""
    account_id=$(jq -r '.id // empty' "$body")
    if expect_code "$HTTP_CODE" "$(get_expectation implemented_api)" && [ -n "$account_id" ]; then
      pass=$((pass+1)); record_step "$steps" "$persona" "create_account" "$(get_expectation implemented_api)" "$HTTP_CODE" "PASS" "account_id=$account_id"
    else
      fail=$((fail+1)); record_step "$steps" "$persona" "create_account" "$(get_expectation implemented_api)" "$HTTP_CODE" "FAIL" "body=$(cat "$body")"
    fi

    total=$((total+1))
    http_call GET "$API_BASE/api/v1/accounts?platform_id=$platform_id" "$body"
    if expect_code "$HTTP_CODE" "$(get_expectation implemented_api)"; then
      pass=$((pass+1)); record_step "$steps" "$persona" "list_accounts_by_platform" "$(get_expectation implemented_api)" "$HTTP_CODE" "PASS" ""
    else
      fail=$((fail+1)); record_step "$steps" "$persona" "list_accounts_by_platform" "$(get_expectation implemented_api)" "$HTTP_CODE" "FAIL" ""
    fi

    if [ -n "$account_id" ]; then
      total=$((total+1))
      http_call PATCH "$API_BASE/api/v1/accounts/$account_id" "$body" "$account_update_payload"
      if expect_code "$HTTP_CODE" "$(get_expectation implemented_api)"; then
        pass=$((pass+1)); record_step "$steps" "$persona" "update_account" "$(get_expectation implemented_api)" "$HTTP_CODE" "PASS" ""
      else
        fail=$((fail+1)); record_step "$steps" "$persona" "update_account" "$(get_expectation implemented_api)" "$HTTP_CODE" "FAIL" ""
      fi
    fi
  fi

  printf "persona=%s\nmode=%s\ntotal=%s\npass=%s\nfail=%s\n" "$persona" "$MODE" "$total" "$pass" "$fail" > "$OUT_DIR/reports/${persona}_summary.env"
}

persona_p2_security_ops() {
  local persona="P2_SECURITY_OPS"
  local steps="$OUT_DIR/reports/${persona}_steps.tsv"
  : > "$steps"

  local total=0 pass=0 fail=0
  local body="$OUT_DIR/data/${persona}_body.json"
  local platform_payload="$OUT_DIR/data/${persona}_create_platform.json"
  local account_payload="$OUT_DIR/data/${persona}_create_account.json"
  local payload_cred="$OUT_DIR/data/${persona}_create_credential.json"
  local payload_assistant="$OUT_DIR/data/${persona}_create_assistant.json"
  local payload_bind="$OUT_DIR/data/${persona}_bind_assistant.json"

  cat > "$platform_payload" <<JSON
{"name":"GitHub","type":"github","config":{"base_url":"https://api.github.com","auth_type":"api_key"}}
JSON

  cat > "$payload_cred" <<JSON
{"account_id":"00000000-0000-0000-0000-000000000000","type":"api_key","expires_at":"2026-12-31T00:00:00Z"}
JSON

  cat > "$payload_assistant" <<JSON
{"name":"ops-assistant","description":"security operations assistant"}
JSON

  cat > "$payload_bind" <<JSON
{"credential_id":"00000000-0000-0000-0000-000000000000","scope":{"resources":["models"],"rate_limit":"1000/day"}}
JSON

  total=$((total+1))
  http_call GET "$CONSOLE_BASE/credentials" "$body"
  if expect_code "$HTTP_CODE" "$(get_expectation console_page)"; then
    pass=$((pass+1)); record_step "$steps" "$persona" "entry_credentials_page" "$(get_expectation console_page)" "$HTTP_CODE" "PASS" ""
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "entry_credentials_page" "$(get_expectation console_page)" "$HTTP_CODE" "FAIL" ""
  fi
  capture_page_artifact "$persona" "credentials" "$CONSOLE_BASE/credentials" >> "$OUT_DIR/logs/${persona}.log" 2>&1

  total=$((total+1))
  http_call POST "$API_BASE/api/v1/platforms" "$body" "$platform_payload"
  local platform_id=""
  platform_id=$(jq -r '.id // empty' "$body")
  if expect_code "$HTTP_CODE" "$(get_expectation implemented_api)" && [ -n "$platform_id" ]; then
    pass=$((pass+1)); record_step "$steps" "$persona" "create_platform_prereq" "$(get_expectation implemented_api)" "$HTTP_CODE" "PASS" "platform_id=$platform_id"
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "create_platform_prereq" "$(get_expectation implemented_api)" "$HTTP_CODE" "FAIL" "$(jq -c '.' "$body" 2>/dev/null || cat "$body")"
  fi

  if [ -n "$platform_id" ]; then
    cat > "$account_payload" <<JSON
{"platform_id":"$platform_id","display_name":"sec-ops-bot"}
JSON
  fi

  total=$((total+1))
  http_call POST "$API_BASE/api/v1/accounts" "$body" "$account_payload"
  local account_id=""
  account_id=$(jq -r '.id // empty' "$body")
  if expect_code "$HTTP_CODE" "$(get_expectation implemented_api)" && [ -n "$account_id" ]; then
    pass=$((pass+1)); record_step "$steps" "$persona" "create_account_prereq" "$(get_expectation implemented_api)" "$HTTP_CODE" "PASS" "account_id=$account_id"
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "create_account_prereq" "$(get_expectation implemented_api)" "$HTTP_CODE" "FAIL" "$(jq -c '.' "$body" 2>/dev/null || cat "$body")"
  fi

  if [ -n "$account_id" ]; then
    cat > "$payload_cred" <<JSON
{"account_id":"$account_id","type":"api_key","expires_at":"2026-12-31T00:00:00Z"}
JSON
  fi

  total=$((total+1))
  http_call POST "$API_BASE/api/v1/credentials" "$body" "$payload_cred"
  local credential_id=""
  credential_id=$(jq -r '.id // empty' "$body")
  if expect_code "$HTTP_CODE" "$(get_expectation planned_api)"; then
    pass=$((pass+1)); record_step "$steps" "$persona" "create_credential" "$(get_expectation planned_api)" "$HTTP_CODE" "PASS" "credential_id=$credential_id"
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "create_credential" "$(get_expectation planned_api)" "$HTTP_CODE" "FAIL" "$(jq -c '.' "$body" 2>/dev/null || cat "$body")"
  fi

  if [ -n "$credential_id" ]; then
    cat > "$payload_bind" <<JSON
{"credential_id":"$credential_id","scope":{"resources":["models"],"rate_limit":"1000/day"}}
JSON
  fi

  total=$((total+1))
  http_call POST "$API_BASE/api/v1/credentials/$credential_id/rotate" "$body"
  if expect_code "$HTTP_CODE" "$(get_expectation planned_api)"; then
    pass=$((pass+1)); record_step "$steps" "$persona" "rotate_credential" "$(get_expectation planned_api)" "$HTTP_CODE" "PASS" ""
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "rotate_credential" "$(get_expectation planned_api)" "$HTTP_CODE" "FAIL" ""
  fi

  total=$((total+1))
  http_call GET "$CONSOLE_BASE/assistants" "$body"
  if expect_code "$HTTP_CODE" "$(get_expectation console_page)"; then
    pass=$((pass+1)); record_step "$steps" "$persona" "entry_assistants_page" "$(get_expectation console_page)" "$HTTP_CODE" "PASS" ""
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "entry_assistants_page" "$(get_expectation console_page)" "$HTTP_CODE" "FAIL" ""
  fi
  capture_page_artifact "$persona" "assistants" "$CONSOLE_BASE/assistants" >> "$OUT_DIR/logs/${persona}.log" 2>&1

  total=$((total+1))
  http_call POST "$API_BASE/api/v1/assistants" "$body" "$payload_assistant"
  local assistant_id=""
  assistant_id=$(jq -r '.id // empty' "$body")
  if expect_code "$HTTP_CODE" "$(get_expectation planned_api)"; then
    pass=$((pass+1)); record_step "$steps" "$persona" "create_assistant" "$(get_expectation planned_api)" "$HTTP_CODE" "PASS" "assistant_id=$assistant_id"
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "create_assistant" "$(get_expectation planned_api)" "$HTTP_CODE" "FAIL" ""
  fi

  total=$((total+1))
  http_call POST "$API_BASE/api/v1/assistants/$assistant_id/bind" "$body" "$payload_bind"
  if expect_code "$HTTP_CODE" "$(get_expectation planned_api)"; then
    pass=$((pass+1)); record_step "$steps" "$persona" "bind_assistant" "$(get_expectation planned_api)" "$HTTP_CODE" "PASS" ""
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "bind_assistant" "$(get_expectation planned_api)" "$HTTP_CODE" "FAIL" ""
  fi

  printf "persona=%s\nmode=%s\ntotal=%s\npass=%s\nfail=%s\n" "$persona" "$MODE" "$total" "$pass" "$fail" > "$OUT_DIR/reports/${persona}_summary.env"
}

persona_p3_compliance_auditor() {
  local persona="P3_COMPLIANCE_AUDITOR"
  local steps="$OUT_DIR/reports/${persona}_steps.tsv"
  : > "$steps"

  local total=0 pass=0 fail=0
  local body="$OUT_DIR/data/${persona}_body.json"
  local payload_export="$OUT_DIR/data/${persona}_audit_export.json"

  cat > "$payload_export" <<JSON
{"from":"2026-01-01T00:00:00Z","to":"2026-01-31T23:59:59Z","format":"csv"}
JSON

  total=$((total+1))
  http_call GET "$CONSOLE_BASE/audit" "$body"
  if expect_code "$HTTP_CODE" "$(get_expectation console_page)"; then
    pass=$((pass+1)); record_step "$steps" "$persona" "entry_audit_page" "$(get_expectation console_page)" "$HTTP_CODE" "PASS" ""
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "entry_audit_page" "$(get_expectation console_page)" "$HTTP_CODE" "FAIL" ""
  fi
  capture_page_artifact "$persona" "audit" "$CONSOLE_BASE/audit" >> "$OUT_DIR/logs/${persona}.log" 2>&1

  total=$((total+1))
  http_call GET "$API_BASE/api/v1/audit" "$body"
  if expect_code "$HTTP_CODE" "$(get_expectation planned_api)"; then
    pass=$((pass+1)); record_step "$steps" "$persona" "list_audit_events" "$(get_expectation planned_api)" "$HTTP_CODE" "PASS" ""
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "list_audit_events" "$(get_expectation planned_api)" "$HTTP_CODE" "FAIL" ""
  fi

  total=$((total+1))
  http_call POST "$API_BASE/api/v1/audit/exports" "$body" "$payload_export"
  local export_id=""
  export_id=$(jq -r '.id // empty' "$body")
  if expect_code "$HTTP_CODE" "$(get_expectation planned_api)"; then
    pass=$((pass+1)); record_step "$steps" "$persona" "create_audit_export" "$(get_expectation planned_api)" "$HTTP_CODE" "PASS" "export_id=$export_id"
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "create_audit_export" "$(get_expectation planned_api)" "$HTTP_CODE" "FAIL" ""
  fi

  total=$((total+1))
  http_call GET "$API_BASE/api/v1/audit/exports/$export_id" "$body"
  if expect_code "$HTTP_CODE" "$(get_expectation planned_api)"; then
    pass=$((pass+1)); record_step "$steps" "$persona" "get_audit_export" "$(get_expectation planned_api)" "$HTTP_CODE" "PASS" ""
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "get_audit_export" "$(get_expectation planned_api)" "$HTTP_CODE" "FAIL" ""
  fi

  printf "persona=%s\nmode=%s\ntotal=%s\npass=%s\nfail=%s\n" "$persona" "$MODE" "$total" "$pass" "$fail" > "$OUT_DIR/reports/${persona}_summary.env"
}

persona_p4_policy_admin() {
  local persona="P4_POLICY_ADMIN"
  local steps="$OUT_DIR/reports/${persona}_steps.tsv"
  : > "$steps"

  local total=0 pass=0 fail=0
  local body="$OUT_DIR/data/${persona}_body.json"

  total=$((total+1))
  http_call GET "$CONSOLE_BASE/settings" "$body"
  if expect_code "$HTTP_CODE" "$(get_expectation console_page)"; then
    pass=$((pass+1)); record_step "$steps" "$persona" "entry_settings_page" "$(get_expectation console_page)" "$HTTP_CODE" "PASS" ""
  else
    fail=$((fail+1)); record_step "$steps" "$persona" "entry_settings_page" "$(get_expectation console_page)" "$HTTP_CODE" "FAIL" ""
  fi
  capture_page_artifact "$persona" "settings" "$CONSOLE_BASE/settings" >> "$OUT_DIR/logs/${persona}.log" 2>&1

  printf "persona=%s\nmode=%s\ntotal=%s\npass=%s\nfail=%s\n" "$persona" "$MODE" "$total" "$pass" "$fail" > "$OUT_DIR/reports/${persona}_summary.env"
}

aggregate() {
  local out="$OUT_DIR/reports/summary_${MODE}.md"
  local total=0 pass=0 fail=0 personas=0

  {
    echo "# Persona Flow Summary (${MODE})"
    echo
    echo "| Persona | Total | Pass | Fail | Success Rate |"
    echo "|---|---:|---:|---:|---:|"

    for f in "$OUT_DIR"/reports/*_summary.env; do
      [ -f "$f" ] || continue
      # shellcheck disable=SC1090
      source "$f"
      personas=$((personas+1))
      total=$((total+total))
      pass=$((pass+pass))
      fail=$((fail+fail))
      local rate="0.00"
      if [ "$total" -gt 0 ]; then
        rate=$(awk -v p="$pass" -v t="$total" 'BEGIN { printf "%.2f", (p/t)*100 }')
      fi
      echo "| $persona | $total | $pass | $fail | ${rate}% |"
    done

    local global_rate="0.00"
    if [ "$total" -gt 0 ]; then
      global_rate=$(awk -v p="$pass" -v t="$total" 'BEGIN { printf "%.2f", (p/t)*100 }')
    fi

    echo
    echo "- Personas: $personas"
    echo "- Total Steps: $total"
    echo "- Passed: $pass"
    echo "- Failed: $fail"
    echo "- Success Rate: ${global_rate}%"
  } > "$out"

  # fix aggregation bug above by recomputing with awk from step files
  awk -F '\t' 'BEGIN{tot=0;ok=0;ko=0} NR>0 {tot++; if($6=="PASS") ok++; else if($6=="FAIL") ko++;} END{printf "tot=%d ok=%d ko=%d\n",tot,ok,ko}' "$OUT_DIR"/reports/P*_steps.tsv > "$OUT_DIR/reports/summary_${MODE}.raw"

  local rt ot kt
  rt=$(awk '{for(i=1;i<=NF;i++){if($i ~ /^tot=/){split($i,a,"="); print a[2]}}}' "$OUT_DIR/reports/summary_${MODE}.raw")
  ot=$(awk '{for(i=1;i<=NF;i++){if($i ~ /^ok=/){split($i,a,"="); print a[2]}}}' "$OUT_DIR/reports/summary_${MODE}.raw")
  kt=$(awk '{for(i=1;i<=NF;i++){if($i ~ /^ko=/){split($i,a,"="); print a[2]}}}' "$OUT_DIR/reports/summary_${MODE}.raw")
  local gr="0.00"
  if [ "${rt:-0}" -gt 0 ]; then
    gr=$(awk -v p="$ot" -v t="$rt" 'BEGIN { printf "%.2f", (p/t)*100 }')
  fi

  {
    echo "# Persona Flow Summary (${MODE})"
    echo
    echo "| Persona | Total | Pass | Fail | Success Rate |"
    echo "|---|---:|---:|---:|---:|"
    for f in "$OUT_DIR"/reports/P*_summary.env; do
      [ -f "$f" ] || continue
      # shellcheck disable=SC1090
      source "$f"
      local r="0.00"
      if [ "$total" -gt 0 ]; then
        r=$(awk -v p="$pass" -v t="$total" 'BEGIN { printf "%.2f", (p/t)*100 }')
      fi
      echo "| $persona | $total | $pass | $fail | ${r}% |"
    done
    echo
    echo "- Total Steps: ${rt:-0}"
    echo "- Passed: ${ot:-0}"
    echo "- Failed: ${kt:-0}"
    echo "- Success Rate: ${gr}%"
  } > "$out"
}

main() {
  echo "mode=$MODE" > "$OUT_DIR/reports/run_${MODE}.meta"
  echo "started_at=$(now_utc)" >> "$OUT_DIR/reports/run_${MODE}.meta"
  echo "api_base=$API_BASE" >> "$OUT_DIR/reports/run_${MODE}.meta"
  echo "console_base=$CONSOLE_BASE" >> "$OUT_DIR/reports/run_${MODE}.meta"

  persona_p1_platform_admin > "$OUT_DIR/logs/P1_PLATFORM_ADMIN.${MODE}.log" 2>&1 &
  p1=$!
  persona_p2_security_ops > "$OUT_DIR/logs/P2_SECURITY_OPS.${MODE}.log" 2>&1 &
  p2=$!
  persona_p3_compliance_auditor > "$OUT_DIR/logs/P3_COMPLIANCE_AUDITOR.${MODE}.log" 2>&1 &
  p3=$!
  persona_p4_policy_admin > "$OUT_DIR/logs/P4_POLICY_ADMIN.${MODE}.log" 2>&1 &
  p4=$!

  wait "$p1" "$p2" "$p3" "$p4"
  aggregate

  cat "$OUT_DIR/reports/summary_${MODE}.md"
}

main
