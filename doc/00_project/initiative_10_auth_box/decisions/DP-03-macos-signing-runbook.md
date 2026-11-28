# DP-03: macOS signing runbook (Touch ID vault provisioning, Apple ID signing check, Developer ID notarization)

> 中文摘要
> - 三个未完成项都只能由 Maurice 本人推进：在 Xcode 登录本人 Apple ID、在真机上点 Touch ID 完成 "Finish setup"、申请 Developer ID 证书并保存 notarytool 凭据。
> - 现状：开发签名已接好（`project.yml` 团队 `35HKS5847W`，自动签名），`scripts/verify-se-signing.sh` 可在登录后自动验收；`scripts/package-dmg.sh` 的 RELEASE 层已写好，但重签时未带 entitlements，按现状大概率会让公证版重新出现 -34018（推断，未在真机验证）。
> - 选项只涉及先后顺序：(A) 先用现有团队做开发签名并完成 Touch ID；(B) 先上付费 Developer ID 再一次性完成；(C) A 立即做、B 在 RELEASE 层修复后做。
> - 建议 C：A 今天即可解锁，B 依赖一处脚本修复。已知坑：Surge 假 DNS 劫持 apple.com、钥匙串里的孤儿证书团队 `L37Q42H4SZ`。

Status: open, owner-only work. Source checkboxes stay `[ ]`. No build was run and no script was changed for this pack.

## 1. Context

Source rows in `doc/00_project/initiative_10_auth_box/task_plan.md`:

- Line 414: `[ ] FINAL (user physical step): launch the signed app, tap Touch ID on "Finish setup" to provision the vault.`
- Line 416: `[ ] HITL (sudo-type credential): add Apple ID ... in Xcode › Settings › Accounts → bash scripts/verify-se-signing.sh → launch app + Touch ID tap on "Finish setup". ... NOT to be replaced by a software key (security retreat).`
- Line 454: `[ ] codesign (Developer ID) + notarize + staple — HITL: wired as the script's RELEASE tier (activates on AUTHBOX_DEV_ID + AUTHBOX_NOTARY_PROFILE env); needs ... Developer ID cert + notarytool profile + DEVELOPMENT_TEAM in project.yml`.
  The last item is already in place: `apps/macos/project.yml:53` sets `DEVELOPMENT_TEAM: 35HKS5847W`.

Related done rows: line 411 (root cause of `keyCreationFailed(-34018)`: persistent SE keys need a team-prefixed
`keychain-access-groups` entitlement honored only under a provisioning-profile-backed signature), line 412 (team
correction: `L37Q42H4SZ` is the orphan keychain cert's team; the real team is `35HKS5847W`), line 413 (Surge fake-DNS maps
`*.apple.com` to `198.18.x` and breaks TLS), line 415 (-34018 mapped to signing guidance), line 833 (orphan-team footgun
repeated on the iPad build).
Why step 1 must be redone: line 412 records the signing check passing once (2026-06-01), but line 832 (section dated
2026-06-17, line 831) records that Xcode had no account signed in. Lines 832-835 provisioned the iPad with an App Store Connect API key instead;
`verify-se-signing.sh:36-38` passes no authentication-key flags, so that route would need a script change and is not used here.

What the code shows today:

| Item | Evidence |
|---|---|
| Signing settings | `apps/macos/project.yml:51-55`: `ENABLE_HARDENED_RUNTIME: YES`, `DEVELOPMENT_TEAM: 35HKS5847W`, `CODE_SIGN_IDENTITY: "Apple Development"`, `CODE_SIGN_STYLE: Automatic`; tests match at `:78-80`. Bundle id `com.authbox.mac` (`:34`). |
| Entitlements | `apps/macos/AuthBoxMac/Resources/AuthBoxMac.entitlements:6-16` app-sandbox, user-selected read-write, network client/server; `:25-28` `keychain-access-groups` = `$(AppIdentifierPrefix)com.authbox.mac`. |
| SE key | `apps/macos/AuthBoxMac/Core/Keychain/SecureEnclaveKeyStore.swift:120-136` creates a permanent SE P-256 key, tag `com.authbox.mac.vault-wrap-key` (`:70`), access control `[.privateKeyUsage, .biometryCurrentSet]`. The header comment (`:6`) says decryption triggers Touch ID. |
| -34018 message | `SecureEnclaveKeyStore.swift:34-40` turns -34018 into "this build isn't signed with a development team ... see scripts/verify-se-signing.sh". |
| "Finish setup" | `apps/macos/AuthBoxMac/Features/Onboarding/OnboardingView.swift:62` button; `:100-107` shows "Setup failed: ..." on error. `VaultSession.swift:160-174` `provisionAndUnlock` derives the vault key from the mnemonic, wraps it, unlocks. |
| Wrapped key item | `VaultSession.swift:216-253` generic-password item, service `com.authbox.mac.vault`, account `com.authbox.mac.wrapped-master-key`. |
| Signing check | `scripts/verify-se-signing.sh:36-38` build with `-allowProvisioningUpdates` and no `-configuration` (Xcode default Debug, matching the `Debug` path at `:31`); `:51` checks `embedded.provisionprofile`; `:59-62` checks signed `keychain-access-groups`. |
| Packaging | `scripts/package-dmg.sh:53-54` Release build with `-allowProvisioningUpdates`; RELEASE tier `:60-71` runs only when both `AUTHBOX_DEV_ID` and `AUTHBOX_NOTARY_PROFILE` are set: `codesign --force --deep --options runtime --timestamp --sign` (`:62-63`), `codesign --verify --strict` (`:64`), `ditto` zip, `notarytool submit --wait` (`:68`), `stapler staple` (`:69`). DMG built after (`:78-85`), mount check (`:88-99`). |

Gaps found while reading (not fixed here, out of scope for this branch):

1. RELEASE tier re-signs with `--force` but no `--entitlements` (`package-dmg.sh:62-63`). Re-signing that way normally
   drops the build's entitlements, so the notarized app would lose `keychain-access-groups` and app-sandbox and hit -34018
   again. It also keeps the development `embedded.provisionprofile`, which does not match a Developer ID certificate;
   line 411 found a profile is required for this entitlement. Inference from the script, unverified on hardware.
   A likely fix is `xcodebuild archive` plus `-exportArchive` with a `developer-id` export method, which installs a
   Developer ID profile and keeps entitlements. That is a code change for a later row. Do not "fix" it by adding
   `--entitlements` next to `--deep`: that stamps the app's entitlements onto every nested binary. The release
   signature must also not carry `com.apple.security.get-task-allow` (a debug entitlement that notarization rejects).
   The comment at `SecureEnclaveKeyStore.swift:36` ("a notarized build never does" hit -34018) is unverified for this reason.
2. The DMG itself is neither signed nor notarized (`package-dmg.sh:82-83` runs after stapling the app). The stapled app
   inside still carries its ticket; notarizing the DMG too is optional hardening.
3. Stale comments: `package-dmg.sh:7-8` and `:73` say the LOCAL tier is ad-hoc, but `:49-54` now uses automatic
   development signing; `HANDOFF.md:53` still says "build is ad-hoc signed" and `task_plan.md:453` "Release ad-hoc .app".
4. Membership conflict: `project.yml:47` and `verify-se-signing.sh:43` call `35HKS5847W` a "free personal team"; `task_plan.md:833` calls it "paid"
   (it owns an iPhone Distribution cert). Developer ID certificates need a paid Apple Developer Program membership.
   Which is true is unverified; the owner checks it in step O5.
5. Where Touch ID prompts: per `SecureEnclaveKeyStore.swift:6`, Touch ID guards decryption, so "Finish setup"
   (wrap = encrypt) may finish without a prompt and the first prompt may come at the next unlock. Unverified on hardware.

## 2. The owner steps in one sentence

The owner signs the owner's Apple ID into Xcode, lets the agent verify the profile-backed signature, provisions the vault
with a physical Touch ID interaction, and, when a paid Developer ID exists, creates the certificate and notarytool profile
so the RELEASE tier can be fixed and run.

## 3. Options (sequencing only)

| | A. Development signing now, Developer ID later | B. Paid Developer ID first, then provision | C. A now, B after the RELEASE-tier fix (hybrid) |
|---|---|---|---|
| Gets | A working Touch ID vault on the owner's Mac today; closes lines 414 and 416. | One provisioning on the build that will ship; closes all three rows in one sitting. | A today; a notarized DMG for other Macs once gap 1 is fixed. |
| Costs | Owner sign-in once. Free-team development profiles expire and need periodic re-provisioning (exact lifetime on macOS unverified). | Paid membership (if not already paid), certificate and notary setup, and a script fix before anything works; Touch ID stays blocked meanwhile. | Same as A, plus B's cost later. |
| Consequences | Keychain items live under the `35HKS5847W.` access-group prefix. A later Developer ID build from the same team keeps that prefix; a different team would not see them. | No dev-signed vault to migrate. Running the RELEASE tier unfixed likely ships an app that fails at "Finish setup". | If B ends up on a different team ID, the vault is re-provisioned by importing the 24-word phrase (`OnboardingView.swift:68` import step; key derivation is deterministic, `VaultSession.swift:166-168`). |
| Undo | Yes: remove the account in Xcode; the SE key is harmless if left. | Partly: a notarization ticket cannot be withdrawn; revoking the Developer ID cert affects every build it signed. | As A, then as B. |

## 4. Recommendation

Option C. Main reason: A is unblocked today with the existing, already-verified check script, while B cannot produce a
working SE build until gap 1 in `package-dmg.sh` is fixed. This is owner-only work; no product decision is made here.

## 5. Owner's exact next steps

At a glance: owner-only steps are 1, 4, 5, 6, 7, 8, 10, 12; the agent runs 2, 3, 9, 11. Today: steps 1-5 in one sitting
at the Mac. Later: steps 6-12, only after step 9 has landed.

Preconditions: an Apple Silicon Mac with Touch ID enrolled (SE + biometrics, `SecureEnclaveKeyStore.swift:120-136`);
Xcode with the macOS 26 SDK (`project.yml:8-13`); `xcodegen` on PATH (both scripts call it); repo checked out.

Network (pitfall, line 413): before any Apple sign-in, provisioning or notarytool call (steps 1, 2, 8, 10), route `apple.com`
DIRECT in Surge or turn the proxy off; restore it afterwards. Check: `dscacheutil -q host -a name developer.apple.com`
must not return a `198.18.x.x` address.

Team (pitfall, lines 412 and 833): always use `35HKS5847W`. Never pick `L37Q42H4SZ`, the orphan cert's team, even if a
keychain "Apple Development" cert offers it. Check, after step 1 (it is empty while no account is signed in, line 832):
`defaults read com.apple.dt.Xcode IDEProvisioningTeams` lists `35HKS5847W`.

Security guardrails (line 416 and the entitlements file):
- Never clear -34018 by signing ad-hoc, removing `keychain-access-groups` or `app-sandbox`, turning off
  `ENABLE_HARDENED_RUNTIME` (`project.yml:51`) or `--options runtime` (`package-dmg.sh:62`), or replacing the SE key
  with a software key. Each is a security retreat; the only fix is a profile-backed signature.
- Credentials (Apple ID password, 2FA codes, the app-specific password, the Developer ID private key or any `.p12`)
  never go into the repo, this doc, an env file, shell history or chat. The failure text of `verify-se-signing.sh`
  (`:42`) prints the account's email address; do not paste that output or `/tmp/verify-se-build.log` into committed files.
- When testing a release build, never bypass Gatekeeper (`xattr -dr com.apple.quarantine`, right-click Open,
  `spctl --master-disable`). Those tips in `package-dmg.sh:9-10` are for the LOCAL tier only.

Part 1, Touch ID vault (lines 416 then 414):

1. [OWNER ONLY] Xcode › Settings › Accounts › `+` › Apple ID: sign in with the owner's Apple ID, complete 2FA.
2. [AGENT, after step 1] `bash scripts/verify-se-signing.sh`. Success prints, in order:
   `OK: build SUCCEEDED with automatic provisioning`, `OK: embedded provisioning profile present`,
   `OK: signed entitlements carry keychain-access-groups = 35HKS5847W.com.authbox.mac`, `OK: SE signing prerequisite satisfied.`
   Failure prints `ERROR: build failed. Most likely cause:` plus matching lines for `No Accounts|No profiles|requires a development team|Communication with Apple`
   (`:39-41`; full log `/tmp/verify-se-build.log`). "Communication with Apple" points to the network pitfall; "No Accounts" to step 1.
   The script prints `OK` for any 10-character team prefix (`:61-62`): if the group is not `35HKS5847W.com.authbox.mac`
   (for example `L37Q42H4SZ.`), treat it as a failure and fix the team before step 4.
   A build that succeeds but is not profile-backed stops with `ERROR: no embedded.provisionprofile ...` (`:54`) or
   `ERROR: signed binary is missing keychain-access-groups ...` (`:64`); in both cases do not go on to step 4.
3. [AGENT] `open apps/macos/build/verify-signing/Build/Products/Debug/AuthBoxMac.app` (path from `verify-se-signing.sh:30-31`).
4. [OWNER ONLY] In the app (`OnboardingView.swift:46,61,62`): press "Create a new vault", write the 24 words down
   offline, tick "I have written down my recovery phrase", press "Finish setup", and answer the Touch ID prompt if one appears. Then lock (sleep or screen lock, `VaultSession.swift`
   auto-lock observers, `VaultSession.swift:199`) and unlock once with Touch ID to prove the unwrap path.
   Success: the vault list appears after setup and after the unlock. Failure: "Setup failed: Couldn't create the Secure
   Enclave key ... [OSStatus -34018]" means the running build is not profile-signed; rerun step 2 and launch exactly that build.
   Pitfall: the key uses `.biometryCurrentSet` (`SecureEnclaveKeyStore.swift:123`), so adding or removing a fingerprint
   in System Settings › Touch ID & Password should make the key unusable; recovery is re-importing the 24-word phrase.
5. [OWNER ONLY] Flip lines 414 and 416 in `task_plan.md` (the agent does not flip owner rows).

Part 2, Developer ID (line 454), only after the RELEASE-tier fix lands:

6. [OWNER ONLY] Check membership at developer.apple.com › Account › Membership details: team `35HKS5847W` must be in the
   paid Apple Developer Program and the owner must be Account Holder (needed to create Developer ID certs).
7. [OWNER ONLY] Xcode › Settings › Accounts › team `35HKS5847W` › Manage Certificates › `+` › Developer ID Application.
   Check: `security find-identity -v -p codesigning` lists `Developer ID Application: ... (35HKS5847W)`.
   The private key stays in the owner's login keychain. Any backup is an exported `.p12` with a strong password, kept
   offline, never committed or shared.
8. [OWNER ONLY] First create an app-specific password for the owner's Apple ID at account.apple.com › Sign-In and
   Security › App-Specific Passwords (Apple's UI path, not in this repo). Then store notary credentials:
   `xcrun notarytool store-credentials authbox-notary --apple-id "<the owner's Apple ID>" --team-id 35HKS5847W`.
   Type the app-specific password only at the interactive prompt; never pass `--password` on the command line.
   Check: `xcrun notarytool history --keychain-profile authbox-notary` returns without an auth error.
9. [AGENT, code row, not this branch] Fix gap 1 (entitlements and Developer ID profile in the RELEASE tier) with a test that
   reads the signed entitlements of the release build.
10. [OWNER ONLY, outward submission to Apple] Re-read the fixed script first: the command, output lines and paths in
    steps 10-11 describe today's `package-dmg.sh` and may change with step 9. Run, pasting for `AUTHBOX_DEV_ID` the exact
    quoted identity that step 7's `security find-identity` printed:
    `AUTHBOX_DEV_ID="Developer ID Application: <name> (35HKS5847W)" AUTHBOX_NOTARY_PROFILE=authbox-notary bash scripts/package-dmg.sh`.
    Success: `NOTE: RELEASE tier`, notarytool reports `status: Accepted`, `OK: signed + notarized + stapled`, `OK: created .../dist/AuthBox-2.0.0.dmg`,
    `OK: DMG verified`. The version comes from `MARKETING_VERSION` (`package-dmg.sh:41-43`, `project.yml:35`).
    Pitfall: the tier needs BOTH variables non-empty (`package-dmg.sh:60`); if either is missing or misspelled the script
    silently builds the LOCAL tier and prints `NOTE: LOCAL tier` (`:73-74`). Treat that line as a failed release run.
    Failure: `set -euo pipefail` (`:28`) stops the script at the first failing command (codesign, notarytool or stapler),
    before `OK: signed + notarized + stapled`; a stopped run can leave `dist/AuthBox-2.0.0-notarize.zip` behind (`:66-70`).
11. [AGENT, read-only checks after step 10, before any re-run of the script, which rebuilds the same path,
    `package-dmg.sh:36-37`] on `apps/macos/build/dmg-dd/Build/Products/Release/AuthBoxMac.app`:
    `codesign -d --entitlements - <app>` still shows `keychain-access-groups` and `com.apple.security.app-sandbox`;
    it does not show `com.apple.security.get-task-allow`;
    `codesign -dv --verbose=4 <app>` shows `flags=0x10000(runtime)`, `Authority=Developer ID Application: ...` and
    `TeamIdentifier=35HKS5847W`; `xcrun stapler validate <app>` succeeds; `spctl -a -vvv -t exec <app>` reports `accepted` with `source=Notarized Developer ID`.
    On rejection: `xcrun notarytool log <submission-id> --keychain-profile authbox-notary` names the failing binary.
12. [OWNER ONLY] Install `dist/AuthBox-2.0.0.dmg` on a Mac without Xcode, run "Finish setup" and one Touch ID unlock, then flip line 454.
    If Gatekeeper blocks the first launch, the release failed; do not bypass it (see guardrails).

Rollback:

- Part 1: remove the account in Xcode › Settings › Accounts. The SE key and wrapped-key item stay in the keychain and are
  reused by the next "Finish setup" (`SecureEnclaveKeyStore.swift:84` loads before creating). `VaultSession.resetVault()`
  (`VaultSession.swift:176-179`) clears the wrapped key but no UI calls it today; the 24-word phrase is the recovery path.
- Part 2: unset either env var and the script returns to the LOCAL tier (`package-dmg.sh:60`, `:72-75`). Revoke the Developer ID
  cert at developer.apple.com only if it leaked; a notarization ticket cannot be withdrawn. Delete the stored notary
  credential from Keychain Access if the profile is retired (exact item name unverified).

## 6. Verified vs unverified

Verified by opening the files: `apps/macos/project.yml`, `apps/macos/AuthBoxMac/Resources/AuthBoxMac.entitlements`,
`scripts/verify-se-signing.sh`, `scripts/package-dmg.sh`, `apps/macos/AuthBoxMac/Core/Keychain/SecureEnclaveKeyStore.swift`,
`apps/macos/AuthBoxMac/Core/Vault/VaultSession.swift`, `apps/macos/AuthBoxMac/Features/Onboarding/OnboardingView.swift`,
`apps/macos/AuthBoxMacTests/KeychainErrorTests.swift:13`, `HANDOFF.md:53,116-124`, `task_plan.md` lines 411-416, 453-454, 831-835.

Unverified: commits `6901d0d` and `1f3e802` cited at lines 411 and 415 (not in this shallow clone); whether team
`35HKS5847W` is paid (gap 4); whether the RELEASE tier really drops entitlements and fails SE at runtime (gap 1, inference);
where the Touch ID prompt appears (gap 5); free-team profile lifetime on macOS; the exact Apple tool output strings in
steps 10-11 (standard Apple tooling, not observed in this repo); whether the release build would carry `get-task-allow`
or nested code (gap 1); the account.apple.com menu path in step 8; that a fingerprint change invalidates the key (step 4, from Apple's documented `.biometryCurrentSet` behavior); no build or script was run for this pack.
