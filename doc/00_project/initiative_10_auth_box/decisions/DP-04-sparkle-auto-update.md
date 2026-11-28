# DP-04: Sparkle auto-update for Auth Box for Mac (adopt, defer, or drop)

> 中文摘要
> - 现状：Mac 版只通过 `scripts/package-dmg.sh` 打出本地 DMG（保留 Xcode 自动的 Apple Development 签名，脚本注释称其为 ad-hoc），手动拖拽安装；代码中没有任何更新机制，Developer ID 签名与公证仍未完成（DP-03）。
> - Sparkle 2 能在已沙盒化的应用中自动更新，但需要：新增 SwiftPM 依赖、新的 EdDSA 签名私钥、HTTPS appcast 托管、沙盒 mach-lookup 例外权限，并且前提是已公证的 Developer ID 发布。
> - 建议：推迟（选项 B），先完成 DP-03 并出至少一个公证版本，再决定是否接入。主要原因：没有公证的 Developer ID 版本，Sparkle 无法安全地交付更新，且团队 ID 若变化会让更新后的应用打不开 Secure Enclave 中的保险库密钥。
> - 新依赖、新签名密钥、appcast 托管地址、是否上 Mac App Store，均只能由 Maurice 决定。

Status: open, owner decision. Source checkbox stays `[ ]`. No code, entitlement, or project file was changed for this pack.

## 1. Context

Source row: `doc/00_project/initiative_10_auth_box/task_plan.md` line 455, `- [ ] optional later: Sparkle auto-update`, under
"P5 — Security review (attacker gate) + Distribution". The row directly above it (line 454) is the open owner-only row
"codesign (Developer ID) + notarize + staple". The same item appears as "Optional later: Sparkle auto-update." in `HANDOFF.md`
line 125 and as "optional Sparkle updates" in `doc/10_features/macos-native-app/ARCHITECTURE.md` line 273.

How the Mac app ships today:

| Fact | Evidence |
|---|---|
| Target is defined by XcodeGen; the `.xcodeproj` is a derived, gitignored cache. | `apps/macos/project.yml` lines 1-3. |
| Only package dependency of the app is the local `AuthBoxCrypto` package; no Sparkle or other updater. | `apps/macos/project.yml` lines 17-20 and 29-31; `apps/ios/AuthBoxCrypto/Package.swift` (deps: BigInt, swift-secp256k1 only). |
| No `SUFeedURL`, `SUPublicEDKey`, appcast, or "Sparkle" string anywhere in code. | `grep -rni "sparkle\|SUFeedURL\|appcast\|SUPublicEDKey"` over the repo hits only the three doc lines above, `doc/10_features/macos-native-app/ARCHITECTURE.html`, `GOAL_LOOP_PLAN.md`, and this pack. |
| Info.plist is generated (`GENERATE_INFOPLIST_FILE: YES`); there is no Info.plist file in the target. | `apps/macos/project.yml` line 37. |
| Version: `MARKETING_VERSION "2.0.0"`, `CURRENT_PROJECT_VERSION "1"`; `/VERSION` reads `2.0.0`. | `apps/macos/project.yml` lines 35-36; `VERSION`. |
| App Sandbox on, user-selected file read-write, network client and server, Hardened Runtime on. | `apps/macos/AuthBoxMac/Resources/AuthBoxMac.entitlements` lines 6-16; `project.yml` line 51. |
| Secure Enclave vault keys live in a team-prefixed keychain access group `$(AppIdentifierPrefix)com.authbox.mac`. | `AuthBoxMac.entitlements` lines 17-28. |
| Signing is automatic development signing, team `35HKS5847W`, identity "Apple Development". The comment calls it a free Personal Team. | `apps/macos/project.yml` lines 43-55. |
| App is a window plus a menu-bar extra. | `apps/macos/AuthBoxMac/App/AuthBoxMacApp.swift` lines 16, 23, 31. |
| Packaging: LOCAL tier builds Release with automatic Apple Development signing (the header calls it "ad-hoc"), keeps that signature, wraps it in a drag-install DMG via `hdiutil`. RELEASE tier (only when `AUTHBOX_DEV_ID` and `AUTHBOX_NOTARY_PROFILE` are set) runs `codesign --force --deep --options runtime --timestamp` with no `--entitlements`, then zips the `.app` for `notarytool submit --wait` and runs `stapler staple` on the `.app`; the DMG built afterwards is itself neither signed nor notarized. | `scripts/package-dmg.sh` lines 1-26, 49-54, 59-75 (notarize/staple of the `.app` at 66-69), 77-85. |
| DMG name comes from `MARKETING_VERSION`; output goes to gitignored `dist/`. | `scripts/package-dmg.sh` lines 41-43; `.gitignore` line 6. |
| No CI workflow builds or signs the Mac app. | `.github/workflows/` holds `ci.yml`, `release-gate.yml`, `agent-design-check.yml`; none contains `xcodebuild` or `macos`. |

So every user today installs and upgrades by hand from a DMG, and no build has been Developer ID signed or notarized yet.

## 2. The decision

Should Auth Box for Mac adopt Sparkle 2 auto-update now, wait until notarized Developer ID releases exist, or drop
auto-update in favour of manual DMG updates or the Mac App Store?

## 3. Options

Sparkle facts below are recalled from its public docs (sparkle-project.org, "Sandboxing" and "EdDSA" pages), not re-fetched
in this session; check them against the release pinned at adoption time.

### A. Adopt Sparkle 2 now (sandboxed XPC installer, EdDSA appcast)

- What it gets: in-app "Check for Updates", background update checks, signed delta-capable updates; users stay current with
  security fixes to a credential broker without re-downloading a DMG.
- What it costs (all new, none present today):
  - New dependency: SwiftPM package `https://github.com/sparkle-project/Sparkle` (product `Sparkle`), added under `packages:`
    and the target's `dependencies:` in `apps/macos/project.yml`. This is outside this branch's scope (new dependency) and is an
    owner decision.
  - New signing key: an EdDSA (ed25519) key pair from Sparkle's `generate_keys` tool. The private key signs every update and
    sits in the owner's login Keychain; the public key goes into Info.plist as `SUPublicEDKey`. Losing the private key means
    existing installs cannot accept updates signed by a new key without a key-rotation release. A leaked private key lets
    anyone who can also serve the feed (or tamper with it) push an update; Sparkle's additional Apple code-signature check is
    the second barrier (exact rotation and same-team rules unverified for the pinned release). The key must never enter the
    repo, CI secrets, or an agent session. Owner decision and owner custody.
  - Info.plist keys `SUFeedURL` (HTTPS appcast URL) and `SUPublicEDKey`, plus `SUEnableInstallerLauncherService = YES` for a
    sandboxed app. Because `project.yml` line 37 generates the Info.plist, these custom keys likely need a real Info.plist file
    (`INFOPLIST_FILE`) merged with the generated one; the exact XcodeGen setting is unverified.
  - Sandbox entitlement: `com.apple.security.temporary-exception.mach-lookup.global-name` with
    `$(PRODUCT_BUNDLE_IDENTIFIER)-spks` and `$(PRODUCT_BUNDLE_IDENTIFIER)-spki`, added to `AuthBoxMac.entitlements`. The existing
    `network.client` entitlement (line 13) means the separate downloader XPC service should not be needed. Security cost:
    these are temporary sandbox exceptions that let the sandboxed credential broker ask Sparkle's installer service, which
    runs outside the app's sandbox, to replace the app bundle. That is a deliberate widening of the P0 containment stated in
    `AuthBoxMac.entitlements` line 5, and it should be named in the next security review.
  - Downgrade and feed integrity: Sparkle offers only a build whose bundle version is higher than the installed one, so
    rollback protection holds only if `CURRENT_PROJECT_VERSION` (`project.yml` line 36, fixed at `"1"`) rises on every
    release and is never reused. The appcast must be HTTPS-only; whether the pinned release can also require a signed appcast
    (and the Info.plist key for it) is unverified. Without one, a feed-host attacker can alter unsigned feed fields such as
    release notes; with or without one, they can withhold updates or replay an old feed (freezing users on an old build),
    though they cannot forge an update.
  - Appcast hosting: a stable HTTPS location for `appcast.xml` and the update archives (for example GitHub Releases plus a static
    page). Where it lives is an owner decision.
  - Release process: per release, bump the version (rule above), run `generate_appcast` or `sign_update`, publish.
  - Signing change: Sparkle's docs advise against `codesign --deep`; `scripts/package-dmg.sh` line 62 uses it. Sparkle's nested
    XPC services and `Autoupdate`/`Updater.app` would need inside-out signing or an Xcode archive/export flow. The same line
    re-signs with no `--entitlements`; DP-03 (gap 1) infers this drops `app-sandbox` and `keychain-access-groups`. An
    auto-update built that way would push a vault-breaking, unsandboxed build to every install at once, so that gap must be
    closed before any Sparkle release.
- Hard dependency on DP-03: Sparkle verifies both the EdDSA signature and the app's Apple code signature. It is meant for
  Developer ID signed, notarized builds; with no notarized build (task_plan.md line 454 still open) there is nothing to update to
  that Gatekeeper accepts on another Mac.
- Consequences: every install then trusts the owner's EdDSA key and polls the feed, each release becomes an owner signing
  step, and the sandbox carries the two exceptions above. Main risk specific to this app: vault keys are bound to the team
  prefix in the keychain access group (entitlements lines 25-28). If the Developer ID release is signed under a different team than `35HKS5847W`, an auto-update would silently deliver a
  build that cannot reach the existing Secure Enclave keys. The first Sparkle-enabled build must already be on the final team.
  (`project.yml` calls `35HKS5847W` a free Personal Team, while `task_plan.md` line 836 says "paid team"; which is true is
  unverified and is DP-03's question (its gap 4). Developer ID certificates require a paid Apple Developer Program membership.)
- Can it be undone? Mostly. The dependency and keys can be removed in a later release, but every install that already has
  Sparkle will keep polling the feed until it updates, so the appcast URL must stay served (or point to a final "manual
  download" release). A published public key cannot be recalled.

### B. Defer until notarized Developer ID releases exist (recommended)

- What it gets: no new dependency, key, entitlement exception, or hosting now; the decision is made once the signing team,
  bundle identity, and keychain group are final (DP-03), so the Sparkle integration is done once against the real identity.
- What it costs: users keep updating by hand from the DMG; security fixes reach them only when they re-download.
- Consequences: the source row stays `[ ]` with a trigger condition ("first notarized release shipped"); no code change.
- Can it be undone? Yes, fully. Nothing is added.

### C. Drop auto-update: manual DMG updates, or the Mac App Store

- C1, manual DMG only: zero new moving parts; the existing `scripts/package-dmg.sh` flow stays the whole release story. Cost:
  update reach depends on users noticing a release. Consequences: row 455 closes as "won't do"; security fixes reach only
  users who re-download. Undoable: yes, Sparkle can be added later (it is option A at that time).
- C2, Mac App Store: Apple handles updates; the app is already sandboxed (entitlements line 6), which MAS requires. Costs: App
  Store review of a credential broker that opens a loopback server (entitlements lines 15-16), an App Store provisioning
  profile, App Store Connect setup, and Apple's review cadence for security fixes. MAS builds cannot ship Sparkle, so A and C2
  are mutually exclusive per distribution channel. Consequences: release timing follows Apple review, and row 455 closes as
  "not applicable for MAS". This is a product-positioning call (channel, pricing, audience) that only the owner can make.
  Undoable: leaving the store is possible, but users then need a manual migration to the direct build, and
  the keychain group must stay identical for the vault to survive the move (unverified for MAS-to-direct transitions).

## 4. Recommendation

Option B: defer. Main reason: the app's signing identity is not final. No Developer ID signed, notarized build exists yet
(`task_plan.md` line 454 open), and the vault's Secure Enclave keys are tied to the signing team (`AuthBoxMac.entitlements`
lines 25-28), so an updater wired now could ship an update that locks users out of their vault. Whether to later pick A, C1,
or C2 is an owner product call; this pack only fixes the order.

Dependency order: DP-03 (team decision, Developer ID cert, notarytool profile, first notarized DMG) must finish before any work
on this row, including its gap 1 (RELEASE-tier re-sign keeps entitlements and embeds a Developer ID profile), see
`decisions/DP-03-macos-signing-runbook.md`.

## 5. Owner's exact next steps

Steps marked [OWNER] can only be done by Maurice. Unmarked steps are code work an agent can do after the owner decides.

1. [OWNER] Finish DP-03: settle the signing team for `com.authbox.mac`, create the Developer ID Application certificate, store
   the notarytool profile, and, once DP-03 gap 1 (entitlements on re-sign) is fixed, run
   `AUTHBOX_DEV_ID="Developer ID Application: <name> (<TEAMID>)" AUTHBOX_NOTARY_PROFILE=<profile> scripts/package-dmg.sh`.
2. [OWNER] Confirm the first notarized DMG opens an existing vault on a second Mac (proves the keychain group and team are final).
3. [OWNER] Choose the channel: A (Sparkle), C1 (manual DMG only), or C2 (Mac App Store). Record the choice under row 455 in
   `task_plan.md`.
4. If A is chosen, [OWNER] approve the new dependency (Sparkle 2, pinned to the current 2.x release at that time) and choose the
   appcast host and its HTTPS URL.
5. If A is chosen, [OWNER] create the EdDSA key on the owner's Mac with Sparkle's own tool from the Sparkle release download
   (`./bin/generate_keys`), keep the private key in the login Keychain, and make one offline backup
   (`./bin/generate_keys -x <backup-file>`). The exported file is the plaintext private key: move it at once into encrypted
   storage (for example an encrypted disk image or password manager) outside the repo and delete the plaintext copy. Hand only
   the printed public key to the agent. Never commit the private key or place it in CI secrets.
6. If A is chosen (agent work, separate PR): add the package and product to `apps/macos/project.yml`; add an Info.plist with
   `SUFeedURL`, `SUPublicEDKey`, `SUEnableInstallerLauncherService`; add the two mach-lookup exceptions to
   `AuthBoxMac.entitlements`; add a "Check for Updates" menu item; make `CURRENT_PROJECT_VERSION` increase per release; replace
   `--deep` signing in `scripts/package-dmg.sh` with inside-out signing of Sparkle's nested components, signing the app itself
   with `--entitlements apps/macos/AuthBoxMac/Resources/AuthBoxMac.entitlements`; add a release check that fails if
   `CURRENT_PROJECT_VERSION` is not higher than the last published one and one that reads `codesign -d --entitlements -` on
   the release app (sandbox, keychain group, and the two mach-lookup names present); run
   `cd apps/macos && xcodegen generate && xcodebuild -scheme AuthBoxMac -destination 'platform=macOS' test` (the `.xcodeproj`
   is generated there and gitignored, `project.yml` lines 1-3).
7. If A is chosen, [OWNER] sign and publish each release on the Mac that holds the key: `./bin/generate_appcast <folder-with-notarized-archives>` (or
   `./bin/sign_update <archive>`), upload `appcast.xml` and archives to the chosen host, then test an update from the previous
   notarized build on a second Mac, confirming the vault still unlocks with Touch ID.
8. If C2 is chosen, [OWNER] create the App Store Connect record and App Store distribution profile, then close row 455.

## 6. Verified vs unverified

Verified by opening the file in this session:

- `doc/00_project/initiative_10_auth_box/task_plan.md` lines 453-455 and 836.
- `apps/macos/project.yml` (packages, deps, Info.plist generation, version, team, Hardened Runtime).
- `apps/macos/AuthBoxMac/Resources/AuthBoxMac.entitlements` (sandbox, network, keychain group).
- `apps/ios/AuthBoxCrypto/Package.swift` (dependency list).
- `apps/macos/AuthBoxMac/App/AuthBoxMacApp.swift` (window + menu-bar extra).
- `scripts/package-dmg.sh` (LOCAL and RELEASE tiers, `--deep`, notarization of the `.app` only, version source).
- `HANDOFF.md` line 125; `doc/10_features/macos-native-app/ARCHITECTURE.md` line 273; `VERSION`; `.gitignore`;
  `.github/workflows/` file list and grep for `xcodebuild`/`macos`; repo-wide grep showing no Sparkle code, feed or key.
- `decisions/DP-03-macos-signing-runbook.md` gap 1 (re-sign without `--entitlements`; itself an inference there) and gap 4
  (free vs paid team).

Unverified:

- All Sparkle specifics (Info.plist key names, mach-lookup names, tool names and flags, `--deep` guidance, code-signature
  check, key rotation, signed-appcast support, version-based downgrade refusal) are from Sparkle's public docs as recalled,
  not re-read in this session; check against the pinned release.
- How XcodeGen merges custom Info.plist keys with `GENERATE_INFOPLIST_FILE: YES`.
- Whether team `35HKS5847W` is a free or paid team (conflicting statements in `project.yml` and `task_plan.md` line 836).
- Whether the DMG in `dist/` was ever built under the RELEASE tier (no notarized artifact is recorded; `dist/` is gitignored).
- No build or test was run for this pack.
