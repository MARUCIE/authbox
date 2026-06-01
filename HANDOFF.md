# HANDOFF — Auth Box for Mac (native macOS app, WP-020)

> Cross-session resume note for the macOS-app work stream. Goal: native SwiftUI
> macOS app fusing password vault + 70+ AI provider hub + agent-authorization
> broker, gated by Touch ID, reusing AuthBoxCrypto + authbox v5 zero-knowledge core.

## State as of 2026-06-01

| Phase | Status | Evidence |
|---|---|---|
| Architecture (2份制) | DONE | `doc/10_features/macos-native-app/ARCHITECTURE.md` + `.html` (VAULT ONYX), commit `85aaab1` |
| P0 Scaffold | DONE | XcodeGen target, build green, commit `6f47598` |
| P1 Auth core | CODE DONE / runtime gated | Touch ID + Secure Enclave + auto-lock, tests 4/4, commit `2c21920`. SE key creation needs dev-team signing (see "Secure Enclave signing" below) — ad-hoc fails -34018 on the real machine. |
| P2 Vault | DONE | SwiftData ciphertext store, CRUD, generator, onboarding; commit `3b03abf` |
| P3 Provider Hub | DONE | TS→Swift catalog codegen (15/91/108), .env import, health checks; commit `27b4fb3` |
| P4 Authorization broker | DONE | real loopback WS gateway, deny-by-default engine, tamper-evident audit; commit `20df92a` |
| P5 Security review (attacker) | DONE | fresh-context audit → 9 findings (1C/2H/4M/2L) all fixed in code; commits `db730eb` (P5a) + `ccbe57c` (P5b) |
| P5 Distribution | BLOCKED (HITL) | needs Maurice's Developer ID cert for codesign/notarize; build is ad-hoc signed |
| P6 AI-Fleet integration | DEFERRED (HITL) | broker client replacing gemini-api-config.json touches the LIVE gemini proxy |

All three fused domains (vault / provider hub / authorization broker) are
implemented + tested, and the attacker-review findings are folded in (P5a/P5b).
`xcodebuild ... test` → **46/46 PASS** (incl. a real loopback WebSocket
round-trip, audit-chain persistence reload + tamper-detect, bearer-token deny,
and SSRF-block — not stubs). Pushed to `origin/main`.

## What exists (apps/macos/)
- `project.yml` — XcodeGen manifest (canonical; `.xcodeproj` is derived + gitignored). Rebuild: `cd apps/macos && xcodegen generate`.
- `AuthBoxMac/App/` — `AuthBoxMacApp.swift` (@main, WindowGroup + MenuBarExtra), `RootView.swift` (4 sections: vault/generator/providers/authorizations; LockedView ⇄ OnboardingView gate), `MenuBarContent.swift`.
- `Core/Auth/BiometricAuth.swift` — `BiometricAuthenticating` + `LABiometricAuth` (LAContext), deny-by-default.
- `Core/Keychain/SecureEnclaveKeyStore.swift` — `VaultKeyWrapping` + SE EC-P256 ECIES wrap/unwrap.
- `Core/Vault/VaultSession.swift` — lock/unlock state machine, `SecureBytes`, Keychain wrapped-key store, auto-lock, `provisionAndUnlock(mnemonic:)`.
- `Core/Storage/VaultStore.swift` — SwiftData `@Model VaultItemRecord` (ciphertext+metadata only), shared process container.
- `Domain/Vault/{VaultService,PasswordGenerator}.swift` — encrypt/store/reveal via VaultCrypto; random + deterministic generation.
- `Domain/Providers/{CredentialCatalog.generated.swift,EnvParser,CredentialHealth,ProviderImportService}.swift` — generated catalog + .env parse + health probes + vault import.
- `Domain/Delegation/DelegationModel.swift` — the 五原语 (Capability/Intent/Policy/Effect/Fact).
- `Core/Policy/PolicyEngine.swift` — deny-by-default engine (5 policy types, injectable clock, async step-up).
- `Core/Broker/{AuthorizationBroker,AuditLog}.swift` — real loopback WebSocket gateway + SHA-256 hash-chain audit.
- `Features/{Vault,Generator,Onboarding,Providers,Authorizations}/` — the SwiftUI surfaces.
- `AuthBoxMacTests/` — 46 tests across VaultSession, VaultService, EnvParser, CredentialHealth (incl. SSRF guard), PolicyEngine, AuditLog (incl. persistence + tamper), Broker (incl. bearer-token auth).
- Codegen: `pnpm run gen:swift-catalog` (regenerate) / `--check` (CI staleness gate).

## Build / test commands
```bash
cd apps/macos
xcodegen generate
xcodebuild -project AuthBoxMac.xcodeproj -scheme AuthBoxMac -destination 'platform=macOS' build
xcodebuild -project AuthBoxMac.xcodeproj -scheme AuthBoxMac -destination 'platform=macOS' test
```

## Visual Verification (2026-06-01)
- `doc/10_features/macos-native-app/screenshots/onboarding.png` — real pixel capture (1800×1184 @2x) of the running app's first-run onboarding screen. The app launched (pid confirmed), front window "Auth Box" rendered at 900×592 (confirmed via System Events), then captured with `screencapture -R`.
- Scope note: the unlocked surfaces (vault list, provider hub, authorizations) sit behind the real Touch ID + Secure Enclave gate, which **cannot run headless** — Maurice must provision a mnemonic on the Mac to capture those. The locked/onboarding screen is the headless-reachable surface.

## P5 — Security review (DONE) + Distribution (next; HITL-gated)

### Attacker review — complete (2026-06-01)
A fresh-context security audit of Core/Domain Swift returned 9 findings; all are
fixed in code (commits `db730eb` P5a, `ccbe57c` P5b). Audited-clean areas: secret
logging, AES-GCM/ECIES usage, Secure Enclave access control, deny-by-default
core, CSPRNG password generation, SwiftData stores only ciphertext, entitlements.

| ID | Sev | Finding | Fix |
|---|---|---|---|
| SEC-001 | Critical | broker authorized any local process (loopback ≠ identity) | per-agent bearer token (SHA-256 hash stored, constant-time verify); unknown/bad-token denied + audited |
| SEC-002 | High | audit chain in-memory only → wiped on restart, tamper-evidence hollow | `AuditFileStore` JSONL persistence; load+continue on launch; `loadedIntegrityOK` |
| SEC-003 | High | vault key copied out of SecureBytes per access; test getter in release | `withVaultKey` borrow closure zeroes transient (resetBytes); `masterKeyForTesting` `#if DEBUG` |
| SEC-004 | Medium | SSRF/exfil via attacker `base_url`/`host` | `isSafeEndpoint`: https-only, refuse loopback/private/link-local/metadata before egress |
| SEC-005 | Medium | header/JSON injection (tavily string-built body) | JSONSerialization body; transport drops CR/LF headers |
| SEC-006 | Medium | broker accepted `.name("localhost")` peer | only verified loopback IP literals |
| SEC-007 | Medium | reused approvalId orphaned in-flight resolver (fail-open-by-hang) | duplicate approvalId denied fail-closed, original intact |
| SEC-008 | Low | seed/keys not zeroed in provisionAndUnlock | `defer resetBytes` on derived seed |
| SEC-009 | Low | idle auto-lock timer not activity-based | `withVaultKey` re-arms the timer on each borrow |

### Distribution
- **DMG packaging — DONE (local tier).** `scripts/package-dmg.sh` builds a Release
  ad-hoc-signed `.app` and wraps it in a drag-install `.dmg` via `hdiutil` (no
  third-party tool). Verified 2026-06-01: produces `dist/AuthBox-0.1.0.dmg` (1.7M),
  mounts with `AuthBoxMac.app` + `/Applications` symlink. `dist/` is gitignored.
  Run: `scripts/package-dmg.sh`.
- **codesign (Developer ID) + notarize + staple — HITL, wired + waiting.** The
  same script's RELEASE tier auto-activates when both env vars are set:
  `AUTHBOX_DEV_ID="Developer ID Application: … (TEAMID)"` and
  `AUTHBOX_NOTARY_PROFILE=<notarytool keychain profile>`. It then does
  `codesign --options runtime` → `notarytool submit --wait` → `stapler staple`.
  This submits to Apple (outward) so it only runs when Maurice exports those vars.
  Also set `DEVELOPMENT_TEAM` in `project.yml` to re-enable app-group +
  keychain-access-groups (currently team-deferred). One command once the cert exists:
  `AUTHBOX_DEV_ID=… AUTHBOX_NOTARY_PROFILE=… scripts/package-dmg.sh`.
- Optional later: Sparkle auto-update.

## P6 — AI-Fleet integration (bonus; HITL-gated)
- Replace `gemini-api-config.json` plaintext-key reads with a broker client (ws://127.0.0.1:19876). Touches the LIVE gemini proxy → production system → HITL before wiring.

## Secure Enclave signing (the one live blocker — 2026-06-01)
The persistent SE wrap key (`Core/Keychain/SecureEnclaveKeyStore.swift`) cannot be
created by an ad-hoc-signed app. Proven empirically on macOS 26.5: ad-hoc → -34018
(`errSecMissingEntitlement`); dev-cert without a provisioning profile → amfid SIGKILL.
macOS keys the SE-resident key into a team-prefixed `keychain-access-groups`, which
only works under a provisioning-profile-backed signature.

Fix is wired (commit on `origin/main`): `project.yml` uses automatic signing with
team `L37Q42H4SZ` (the `Apple Development: maoyuan.wen@proton.me` identity already in
the keychain) + `keychain-access-groups` re-enabled in `AuthBoxMac.entitlements`.

**Remaining one-time action (sudo-type HITL):** add the Apple ID `maoyuan.wen@proton.me`
in **Xcode > Settings > Accounts** (free personal team L37Q42H4SZ appears). Then:
```bash
bash scripts/verify-se-signing.sh   # asserts profile + signed keychain-access-groups
```
If OK → launch the app, tap Touch ID on "Finish setup". The Touch ID tap is the only
step that can never be headless. Do NOT swap the SE design for a software key to dodge
the account — that is a security retreat (see notes.md 2026-06-01).

## Hard constraints / gotchas
- **Deployment target = macOS 26.0** (latest, "Tahoe"). Set 2026-06-01: dev/run/test host is macOS 26.5 and only the 26.5 SDK is installed, so 26.0 is the honest floor — the app is built/run/tested on exactly the OS it targets, and standard SwiftUI controls pick up Liquid Glass styling for free. The shared `AuthBoxCrypto` SwiftPM package stays `.macOS(.v14)` (cross-platform with iOS 17); a 26.0 app depending on a 14-min package is valid. To broaden to older Macs (e.g. workshop distribution), flip the three `project.yml` deploymentTarget entries back to "15.0"/"14.0" + `xcodegen generate`.
- **Manual UX gate**: the real Touch ID + Secure Enclave round-trip cannot run headless. Provision a key + unlock on the Mac to exercise it (Maurice).
- **Signing (2026-06-01)**: keychain-access-groups is now ENABLED + automatic dev-team signing (L37Q42H4SZ) is wired — see "Secure Enclave signing" above; needs the Apple ID added in Xcode Accounts once. The app-group `group.com.authbox.shared` (for the future AutoFill extension) is still deferred — App Groups needs a separate provisioned capability; add it only when that extension lands.
- Product/module name is `AuthBoxMac` (display name "Auth Box" via CFBundleDisplayName). Test import: `@testable import AuthBoxMac`. Do NOT re-add `PRODUCT_NAME` (breaks TEST_HOST).
- Secrets only in Keychain + Secure Enclave; never in bundle/git (ADR-004).
- Policy engine (P4) must be deny-by-default (PM-20260531-002).

## Canonical docs
- Architecture: `doc/10_features/macos-native-app/ARCHITECTURE.md`
- Atomic queue: `doc/00_project/initiative_10_auth_box/task_plan.md §WP-020`
- Running log: `doc/00_project/initiative_10_auth_box/notes.md`
- System arch (rolled forward): `doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md` (Layer 3 desktop → native macOS)

---
Maurice | maurice_wen@proton.me
