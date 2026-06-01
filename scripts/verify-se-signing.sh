#!/usr/bin/env bash
#
# verify-se-signing.sh — prove the Secure-Enclave signing prerequisite is satisfied.
#
# WHY THIS EXISTS
#   Persistent Secure Enclave keys (the vault's master-key wrapper, ADR-004) cannot
#   be created by an ad-hoc-signed app: macOS keys the SE-resident private key into a
#   team-prefixed `keychain-access-groups` access group, and that entitlement is only
#   honored when the binary carries a provisioning-profile-backed signature.
#   Empirically on macOS 26.5 (2026-06-01) every team-less variant failed:
#     - ad-hoc + SE key                         -> errSecMissingEntitlement (-34018)
#     - dev-cert + application-identifier        -> amfid SIGKILL (no profile)
#     - dev-cert + keychain-access-groups only   -> amfid SIGKILL (no profile)
#     - ad-hoc + biometric-ACL keychain item     -> errSecMissingEntitlement (-34018)
#   The ONLY fix that preserves the SE design is automatic development signing, which
#   needs an Apple ID in Xcode > Settings > Accounts (a one-time, sudo-style credential
#   action — it cannot be done headless).
#
# WHAT IT CHECKS (after the Apple ID has been added):
#   1. the project builds with automatic provisioning;
#   2. the built .app embeds a provisioning profile;
#   3. its signed entitlements include the team-prefixed keychain-access-groups.
#   If all three pass, "Finish setup" on the running app will create the SE key —
#   the only remaining step is the user's physical Touch ID tap (never headless).
#
set -euo pipefail

cd "$(dirname "$0")/.."
MACOS_DIR="$(pwd)/apps/macos"
DD="$MACOS_DIR/build/verify-signing"
APP="$DD/Build/Products/Debug/AuthBoxMac.app"

echo "NOTE: building with automatic provisioning (needs Apple ID in Xcode Accounts)"
( cd "$MACOS_DIR" && xcodegen generate >/dev/null )

if ! xcodebuild -project "$MACOS_DIR/AuthBoxMac.xcodeproj" -scheme AuthBoxMac \
      -destination 'platform=macOS' -derivedDataPath "$DD" \
      -allowProvisioningUpdates build >/tmp/verify-se-build.log 2>&1; then
  echo "ERROR: build failed. Most likely cause:"
  grep -iE "No Accounts|No profiles|requires a development team|Communication with Apple" \
    /tmp/verify-se-build.log | sed 's/^/  /' | sort -u || true
  echo "  -> Open Xcode > Settings > Accounts, add the Apple ID 'maoyuan.wen@proton.me'"
  echo "     (free personal team 35HKS5847W = 'maoyuan wen Personal Team'), then re-run."
  echo "  (full log: /tmp/verify-se-build.log)"
  exit 1
fi
echo "OK: build SUCCEEDED with automatic provisioning"
[ -d "$APP" ] || { echo "ERROR: $APP not found"; exit 1; }

# 2. embedded provisioning profile
if [ -f "$APP/Contents/embedded.provisionprofile" ]; then
  echo "OK: embedded provisioning profile present"
else
  echo "ERROR: no embedded.provisionprofile — signature is not profile-backed (SE will still fail)"
  exit 1
fi

# 3. team-prefixed keychain-access-groups in the SIGNED entitlements
ENTS="$(codesign -d --entitlements - "$APP" 2>/dev/null | tr -d '\0')"
if echo "$ENTS" | grep -q "keychain-access-groups"; then
  GROUP="$(echo "$ENTS" | grep -A8 keychain-access-groups | grep -oE '[A-Z0-9]{10}\.[a-zA-Z0-9.]+' | head -1 || true)"
  echo "OK: signed entitlements carry keychain-access-groups = ${GROUP:-<present>}"
else
  echo "ERROR: signed binary is missing keychain-access-groups (SE key creation will fail)"
  exit 1
fi

echo ""
echo "OK: SE signing prerequisite satisfied. Launch the app and tap Touch ID on"
echo "    'Finish setup' to provision the vault — that physical tap is the only"
echo "    step that cannot be automated."
