# HANDOFF — Auth Box for Mac (native macOS app, WP-020)

> Cross-session resume note for the macOS-app work stream. Goal: native SwiftUI
> macOS app fusing password vault + 70+ AI provider hub + agent-authorization
> broker, gated by Touch ID, reusing AuthBoxCrypto + authbox v5 zero-knowledge core.

## WP-021 — iOS/iPad Frontend Completion Loop (ACTIVE, 2026-06-17)

> Separate work stream from the macOS app below. Self-paced ultracode /loop:
> complete iOS+iPad frontend, design-pipeline-first. Canonical queue:
> `doc/00_project/initiative_10_auth_box/task_plan.md §WP-021`.

- Ground truth: iPhone app is largely DONE (vault/TOTP/wallet/settings/iCloud-sync/AutoFill/Pro, wired to Go API). **Real gap = iPad has NO adaptive UI** (`device family "1,2"` but every screen is iPhone single-column TabView+NavigationStack; zero `NavigationSplitView`/`horizontalSizeClass`).
- DONE P1/P2 (design pipeline): VAULT ONYX tokens formalized → `design/tokens/vault-onyx.{tokens.json,css}` (64 vars). Real HTML bake-off → `design/ipad-bakeoff/{vault,wallet}/{a-threecol,b-inspector,c-canvas}.html` (6 drafts). Verdict `design/bigao-result.json`, `stitch-pipeline-gate.py` PASS. **Winner = B-idiom** (slim icon-rail TabView + NavigationSplitView master/detail + collapsible `.inspector`, grafting A's auto-collapse + A's health ring).
- Design language reference (drives translation): `doc/10_features/ios-ipad-frontend/IPAD_DESIGN_LANGUAGE.md` — per-screen NavigationSplitView mapping for all 5 screens + token→SwiftUI bridge.
- Method note: subagent fan-out hit a persistent SERVER rate-limit (not usage) twice → pivoted off Workflow bursts to main-loop per the 2-strike rule. 3 secondary screens (settings/onboarding/generator) inherit the decided language rather than re-bidding.
- DONE P3 (SwiftUI translation): Vault + Settings + Wallet all → `NavigationSplitView` master/detail (selection bound to item id; iPhone-compact auto-collapses to push). iPad Pro 13-inch (M5) BUILD SUCCEEDED ×3. Generator = single Form, Onboarding = full-screen modal (correct single-pane). Files: `apps/ios/AuthBox/Sources/Features/{Vault/VaultListView,Settings/SettingsView,Wallet/WalletView}.swift`.
- DONE P4 (visual acceptance, 3 honest rounds): no-tap seams `--ipad-demo-seed` + `--ipad-demo-tab <tab>`. R1 structural verify (all 3 splits live w/ real data) + Generator `maxWidth:760` fix + iPhone non-regression. R2 dark-mode PASS (badges/icons/TOTP-ring retain contrast). R3 accessibility-extra-large Dynamic Type PASS (clean truncation, no overlap). Evidence: `design/visual-acceptance/{r1,r2,r2-dark,r3-a11y,r1-iphone}/*`. One code fix shipped (GeneratorView). No further cosmetic debt — screens SOTA across light/dark, iPad/iPhone, standard/XXL text.
- DONE P5 (UX-map + functional closure): read-binding seam audit (all writers present, no orphans; delete clears selection), crypto-not-stubbed (real BIP-84/EIP-55/TOTP/password derivation; TOTP changed 960→371→550 across captures = live), and **FULL iPad test suite GREEN** (AuthBoxTests 9/9 + AuthBoxUITests 6/6, `TEST SUCCEEDED`). Caught + FIXED a real iPad gap: every UI test used `app.tabBars.buttons[...]` which finds nothing on iPad's floating tab bar (`_UIFloatingTabBarItemCell`) — Wallet/Paywall hard-failed, FullFlow silently skipped (false-pass). Fix: `tabButton()` helper (tabBars → `app.buttons[name].firstMatch`) in 3 test files; 4 failures → 0.
- **WP-021 ACCEPTANCE COMPLETE (R1-R6 all pass).** App verified across light+dark, iPad+iPhone, standard+XXL text; journeys functionally wired (real crypto, no stubs). **FULL test suite GREEN on BOTH form factors** (iPad + iPhone, each unit 9/9 + UI 6/6). Functional-closure pass caught + fixed TWO real bugs: (1) iPad UI tab-nav blind to floating tab bar (`tabButton()` helper in 3 test files); (2) iPhone Settings regression from my own NavigationSplitView conversion — `selection = .security` default pushed iPhone straight into Security detail, hiding the sidebar+Pro banner (caught by iPhone Paywall test; my R1 spot-check missed it by not screenshotting Settings). Fixed with `selection = nil` + `hSizeClass == .regular`-guarded `autoSelectOnPad()`. Visual proof: design/visual-acceptance/r3-settings-fix/settings-iphone-sidebar.png.
- CLOSEOUT DONE (Maurice "全部授权" 2026-06-17): committed `fd5cd9b` on branch `feat/ipad-frontend-wp021` (author Maurice Wen, no AI trailer). `design/visual-acceptance/` (5.7M evidence PNGs) gitignored; design source + code + tests tracked. NOT merged to `main` (PR/merge is Maurice's call).
- LIVE front+back wallet-balance integration VERIFIED: iOS `WalletBalanceService` → same public indexers as Go `balance_provider.go` (mempool.space BTC / publicnode RPC ETH). Curled exact endpoints+addresses: BTC `bc1qcr8te4kr609…` funded=spent=4080991 → 0 sats → "0 BTC" (real fetch, not placeholder); ETH `0x9858…Eda94` `eth_getBalance`=0x0 → "0 ETH". Binding wired (.task→refreshBalance→balance()). App Store deploy = separate HITL (asc), out of scope.
- Uncommitted: WP-021 artifacts are on disk, NOT yet committed (on `main`; awaiting a branch/commit decision).

## State as of 2026-06-01

| Phase | Status | Evidence |
|---|---|---|
| Architecture (2份制) | DONE | `doc/10_features/macos-native-app/ARCHITECTURE.md` + `.html` (VAULT ONYX), commit `85aaab1` |
| P0 Scaffold | DONE | XcodeGen target, build green, commit `6f47598` |
| P1 Auth core | DONE (signing verified) | Touch ID + Secure Enclave + auto-lock, tests 4/4, commit `2c21920`. SE key creation needs dev-team signing — now wired (team 35HKS5847W) + VERIFIED provisioning; only the user's Touch ID tap on "Finish setup" remains. See "Secure Enclave signing" below. |
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

## Secure Enclave signing (RESOLVED — 2026-06-01)
The persistent SE wrap key (`Core/Keychain/SecureEnclaveKeyStore.swift`) cannot be
created by an ad-hoc-signed app. Proven empirically on macOS 26.5: ad-hoc → -34018
(`errSecMissingEntitlement`); dev-cert without a provisioning profile → amfid SIGKILL.
macOS keys the SE-resident key into a team-prefixed `keychain-access-groups`, which
only works under a provisioning-profile-backed signature.

Fix (on `origin/main`): `project.yml` uses automatic signing with team **`35HKS5847W`**
("maoyuan wen Personal Team" — the team the `maoyuan.wen@proton.me` Apple ID actually
belongs to) + `keychain-access-groups` re-enabled in `AuthBoxMac.entitlements`.

> Team gotcha (cost me a cycle): the keychain held an orphan cert
> `Apple Development: maoyuan.wen@proton.me (L37Q42H4SZ)`, but the signed-in account's
> team is `35HKS5847W`. `security find-identity` shows the cert's team, NOT the account's
> active team — always read `defaults read com.apple.dt.Xcode IDEProvisioningTeams`
> (teamID) for the team automatic signing will actually use.

**VERIFIED 2026-06-01** via `bash scripts/verify-se-signing.sh`: build SUCCEEDED with
automatic provisioning, embedded provisioning profile present, signed entitlements
carry `keychain-access-groups = 35HKS5847W.com.authbox.mac`. The SE key creation
prerequisite is satisfied.

**Only remaining step:** launch the signed app and tap Touch ID on "Finish setup" —
the physical biometric tap is the one action that can never run headless. (Apple ID
sign-in + dev-portal provisioning need direct network: Surge fake-DNS intercepts
`*.apple.com` to 198.18.x and breaks the TLS — route apple.com DIRECT or disable the
proxy during sign-in. See notes.md 2026-06-01.) Do NOT swap the SE design for a
software key — that is a security retreat.

## Hard constraints / gotchas
- **Deployment target = macOS 26.0** (latest, "Tahoe"). Set 2026-06-01: dev/run/test host is macOS 26.5 and only the 26.5 SDK is installed, so 26.0 is the honest floor — the app is built/run/tested on exactly the OS it targets, and standard SwiftUI controls pick up Liquid Glass styling for free. The shared `AuthBoxCrypto` SwiftPM package stays `.macOS(.v14)` (cross-platform with iOS 17); a 26.0 app depending on a 14-min package is valid. To broaden to older Macs (e.g. workshop distribution), flip the three `project.yml` deploymentTarget entries back to "15.0"/"14.0" + `xcodegen generate`.
- **Manual UX gate**: the real Touch ID + Secure Enclave round-trip cannot run headless. Provision a key + unlock on the Mac to exercise it (Maurice).
- **Signing (2026-06-01, VERIFIED)**: keychain-access-groups ENABLED + automatic dev-team signing (team `35HKS5847W`, personal team) — provisioning verified, signed group = `35HKS5847W.com.authbox.mac`. See "Secure Enclave signing" above. The app-group `group.com.authbox.shared` (for the future AutoFill extension) is still deferred — App Groups needs a separate provisioned capability; add it only when that extension lands.
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
