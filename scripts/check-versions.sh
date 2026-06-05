#!/usr/bin/env bash
# check-versions.sh — enforce one product version across every platform.
#
# Single source of truth: /VERSION. Every shippable surface must match it:
#   • npm packages (package.json "version"): root, apps/web, apps/console,
#     apps/video, apps/extension, packages/{crypto,mcp-protocol,shared}
#   • native apps (project.yml MARKETING_VERSION): apps/macos, apps/ios
#
# Usage:
#   scripts/check-versions.sh          # verify all surfaces match /VERSION (CI gate)
#   scripts/check-versions.sh --set    # rewrite all surfaces to /VERSION (release bump)
#
# Exit 0 = all in sync; exit 1 = drift found (lists every offender).
set -euo pipefail
cd "$(dirname "$0")/.."

WANT="$(tr -d ' \n' < VERSION)"
MODE="${1:-check}"

PKGS=(
  package.json
  apps/web/package.json
  apps/console/package.json
  apps/video/package.json
  apps/extension/package.json
  packages/crypto/package.json
  packages/mcp-protocol/package.json
  packages/shared/package.json
)
YMLS=(apps/macos/project.yml apps/ios/project.yml)

drift=0

pkg_get() { python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('version',''))" "$1"; }
pkg_set() { python3 - "$1" "$WANT" <<'PY'
import json,sys,collections
f,want=sys.argv[1],sys.argv[2]
d=json.load(open(f),object_pairs_hook=collections.OrderedDict)
if d.get("version")==want: sys.exit(0)
out=collections.OrderedDict()
done=False
for k,v in d.items():
    out[k]=v
    if k=="version": out[k]=want; done=True
if not done:
    o2=collections.OrderedDict()
    for k,v in out.items():
        o2[k]=v
        if k=="name": o2["version"]=want
    out=o2
json.dump(out,open(f,"w"),indent=2); open(f,"a").write("\n")
PY
}
yml_get() { grep -E "MARKETING_VERSION" "$1" | head -1 | sed -E 's/.*"([^"]+)".*/\1/'; }
yml_set() { /usr/bin/sed -i '' -E "s/(MARKETING_VERSION: )\"[^\"]+\"/\1\"$WANT\"/" "$1"; }

for f in "${PKGS[@]}"; do
  [ -f "$f" ] || { echo "MISS  $f (absent)"; continue; }
  cur="$(pkg_get "$f")"
  if [ "$MODE" = "--set" ]; then
    [ "$cur" = "$WANT" ] || { pkg_set "$f"; echo "SET   $f  $cur -> $WANT"; }
  elif [ "$cur" != "$WANT" ]; then echo "DRIFT $f  $cur != $WANT"; drift=1
  else echo "OK    $f  $cur"; fi
done

for f in "${YMLS[@]}"; do
  [ -f "$f" ] || { echo "MISS  $f (absent)"; continue; }
  cur="$(yml_get "$f")"
  if [ "$MODE" = "--set" ]; then
    [ "$cur" = "$WANT" ] || { yml_set "$f"; echo "SET   $f  $cur -> $WANT"; }
  elif [ "$cur" != "$WANT" ]; then echo "DRIFT $f  MARKETING_VERSION $cur != $WANT"; drift=1
  else echo "OK    $f  $cur"; fi
done

if [ "$MODE" = "--set" ]; then
  echo "All surfaces set to $WANT. Run 'xcodegen generate' in apps/macos and apps/ios to regenerate."
elif [ "$drift" -ne 0 ]; then
  echo "ERROR: version drift vs /VERSION ($WANT). Run 'scripts/check-versions.sh --set' to fix." >&2
  exit 1
else
  echo "OK: all platforms at $WANT."
fi
