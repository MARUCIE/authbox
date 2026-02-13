#!/usr/bin/env bash
set -euo pipefail

BASE=""
HEAD="HEAD"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE="$2"; shift 2 ;;
    --head)
      HEAD="$2"; shift 2 ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "${BASE}" ]]; then
  echo "ERROR: --base <sha> is required" >&2
  exit 2
fi

if [[ ! -d postmortem ]]; then
  echo "PASS (no postmortem directory)";
  exit 0
fi

shopt -s nullglob
pm_files=(postmortem/PM-*.md)
if [[ ${#pm_files[@]} -eq 0 ]]; then
  echo "PASS (no postmortem files)";
  exit 0
fi

# Exclude postmortem files to avoid triggers matching themselves.
diff_file=$(mktemp)
trap 'rm -f "$diff_file"' EXIT

git diff "${BASE}..${HEAD}" -- . ':!postmortem/*' > "$diff_file"

hits=0
for pm in "${pm_files[@]}"; do
  while IFS= read -r line; do
    regex=${line#TRIGGER_REGEX:}
    regex=${regex# }
    [[ -n "$regex" ]] || continue

    if rg -n "$regex" "$diff_file" >/dev/null 2>&1; then
      echo "HIT pm=$pm regex=$regex"
      hits=1
    fi
  done < <(rg -n '^TRIGGER_REGEX:' "$pm" | sed -E 's/^TRIGGER_REGEX:[ ]*//')
done

if [[ $hits -ne 0 ]]; then
  echo "FAIL"
  exit 1
fi

echo "PASS"
