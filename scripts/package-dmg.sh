#!/usr/bin/env bash
#
# package-dmg.sh — build a distributable .dmg of "Auth Box for Mac".
#
# Two tiers (see HANDOFF.md §P5):
#
#   LOCAL  (default — no Apple cert needed)
#     Builds a Release, ad-hoc-signed .app and wraps it in a drag-install .dmg.
#     Runs on THIS Mac (Gatekeeper: right-click > Open once, or strip quarantine
#     with `xattr -dr com.apple.quarantine`). No network, no Apple account.
#     This is the tier used for Maurice's own machine and for local verification.
#
#   RELEASE  (opt-in — needs Maurice's Developer ID + notarytool profile)
#     Activated when BOTH env vars are set:
#       AUTHBOX_DEV_ID        e.g. "Developer ID Application: Maurice Wen (TEAMID)"
#       AUTHBOX_NOTARY_PROFILE name of a stored `xcrun notarytool store-credentials`
#                              keychain profile
#     Adds: Developer ID codesign (--options runtime) -> notarytool submit --wait
#     -> stapler staple. This SUBMITS the app to Apple (outward action) and is
#     therefore HITL — it only runs when you explicitly export those two vars.
#
# Usage:
#   scripts/package-dmg.sh                 # LOCAL tier
#   AUTHBOX_DEV_ID="Developer ID Application: … (TEAMID)" \
#   AUTHBOX_NOTARY_PROFILE=authbox-notary \
#     scripts/package-dmg.sh               # RELEASE tier (HITL)
#
set -euo pipefail

cd "$(dirname "$0")/.."                       # repo root
REPO="$(pwd)"
MACOS_DIR="$REPO/apps/macos"
SCHEME="AuthBoxMac"
APP_NAME="AuthBoxMac.app"                      # on-disk bundle (display name = "Auth Box")
VOL_NAME="Auth Box"
DD="$MACOS_DIR/build/dmg-dd"
PRODUCTS="$DD/Build/Products/Release"
DIST="$REPO/dist"                             # gitignored
STAGING="$DIST/.staging"

VERSION="$(grep -m1 'MARKETING_VERSION' "$MACOS_DIR/project.yml" | sed -E 's/.*"([^"]+)".*/\1/')"
[ -n "$VERSION" ] || VERSION="0.0.0"
DMG="$DIST/AuthBox-$VERSION.dmg"

echo "NOTE: packaging Auth Box $VERSION"

# 1. Fresh project + Release build ---------------------------------------------
( cd "$MACOS_DIR" && xcodegen generate >/dev/null )
# -allowProvisioningUpdates: the app uses automatic development signing (team
# 35HKS5847W, "maoyuan wen Personal Team") because persistent Secure Enclave keys
# need a provisioning-profile-backed signature. Requires an Apple ID in Xcode >
# Settings > Accounts (one-time).
xcodebuild -project "$MACOS_DIR/AuthBoxMac.xcodeproj" -scheme "$SCHEME" \
  -configuration Release -derivedDataPath "$DD" -allowProvisioningUpdates build >/dev/null
APP="$PRODUCTS/$APP_NAME"
[ -d "$APP" ] || { echo "ERROR: $APP not found after build"; exit 1; }
echo "OK: built $APP"

# 2. RELEASE tier — Developer ID codesign + notarize (HITL, opt-in) ------------
if [ -n "${AUTHBOX_DEV_ID:-}" ] && [ -n "${AUTHBOX_NOTARY_PROFILE:-}" ]; then
  echo "NOTE: RELEASE tier — Developer ID codesign + notarize"
  codesign --force --deep --options runtime --timestamp \
    --sign "$AUTHBOX_DEV_ID" "$APP"
  codesign --verify --strict --verbose=2 "$APP"
  # Notarize the app (zip it for submission), then staple the ticket.
  _ZIP="$DIST/AuthBox-$VERSION-notarize.zip"
  /usr/bin/ditto -c -k --keepParent "$APP" "$_ZIP"
  xcrun notarytool submit "$_ZIP" --keychain-profile "$AUTHBOX_NOTARY_PROFILE" --wait
  xcrun stapler staple "$APP"
  rm -f "$_ZIP"
  echo "OK: signed + notarized + stapled"
else
  echo "NOTE: LOCAL tier — ad-hoc signature kept (set AUTHBOX_DEV_ID +"
  echo "      AUTHBOX_NOTARY_PROFILE to produce a notarized build)."
fi

# 3. Stage + build the DMG (hdiutil — no third-party tool) ---------------------
rm -rf "$STAGING" "$DMG"
mkdir -p "$STAGING"
cp -R "$APP" "$STAGING/"
ln -s /Applications "$STAGING/Applications"     # drag-to-install affordance
hdiutil create -volname "$VOL_NAME" -srcfolder "$STAGING" \
  -ov -format UDZO "$DMG" >/dev/null
rm -rf "$STAGING"
echo "OK: created $DMG ($(du -h "$DMG" | cut -f1))"

# 4. Verify the DMG mounts and contains the app --------------------------------
_MNT="$(mktemp -d)"
hdiutil attach "$DMG" -nobrowse -mountpoint "$_MNT" >/dev/null
if [ -d "$_MNT/$APP_NAME" ]; then
  echo "OK: DMG verified — $APP_NAME present, /Applications symlink $([ -L "$_MNT/Applications" ] && echo present || echo MISSING)"
  _RC=0
else
  echo "ERROR: $APP_NAME not found inside mounted DMG"
  _RC=1
fi
hdiutil detach "$_MNT" >/dev/null
rmdir "$_MNT" 2>/dev/null || true
exit "$_RC"
