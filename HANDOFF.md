# HANDOFF — Auth Box for Mac (native macOS app, WP-020)

> Cross-session resume note for the macOS-app work stream. Goal: native SwiftUI
> macOS app fusing password vault + 70+ AI provider hub + agent-authorization
> broker, gated by Touch ID, reusing AuthBoxCrypto + authbox v5 zero-knowledge core.

## State as of 2026-06-01

| Phase | Status | Evidence |
|---|---|---|
| Architecture (2份制) | DONE | `doc/10_features/macos-native-app/ARCHITECTURE.md` + `.html` (VAULT ONYX), commit `85aaab1` |
| P0 Scaffold | DONE | XcodeGen target, build green, commit `6f47598` |
| P1 Auth core | DONE | Touch ID + Secure Enclave + auto-lock, tests 4/4, commit `2c21920` |
| P2 Vault | NEXT | not started |
| P3 Provider Hub / P4 Broker / P5 Dist / P6 AI-Fleet | TODO | see `task_plan.md §WP-020` |

3 commits ahead of `origin/main` at handoff time (pushed in the same session if `local_ahead` shows 0 afterwards).

## What exists (apps/macos/)
- `project.yml` — XcodeGen manifest (canonical; `.xcodeproj` is derived + gitignored). Rebuild: `cd apps/macos && xcodegen generate`.
- `AuthBoxMac/App/` — `AuthBoxMacApp.swift` (@main, WindowGroup + MenuBarExtra), `RootView.swift` (3-domain NavigationSplitView + LockedView), `MenuBarContent.swift`.
- `AuthBoxMac/Core/Auth/BiometricAuth.swift` — `BiometricAuthenticating` protocol + `LABiometricAuth` (LAContext), deny-by-default.
- `AuthBoxMac/Core/Keychain/SecureEnclaveKeyStore.swift` — `VaultKeyWrapping` protocol + SE EC-P256 ECIES wrap/unwrap.
- `AuthBoxMac/Core/Vault/VaultSession.swift` — lock/unlock state machine, `SecureBytes`, `WrappedKeyStore` + Keychain impl, auto-lock observers.
- `AuthBoxMacTests/VaultSessionTests.swift` — 4 headless state tests (PASS).

## Build / test commands
```bash
cd apps/macos
xcodegen generate
xcodebuild -project AuthBoxMac.xcodeproj -scheme AuthBoxMac -destination 'platform=macOS' build
xcodebuild -project AuthBoxMac.xcodeproj -scheme AuthBoxMac -destination 'platform=macOS' test
```

## P2 — Vault (next, do this)
1. Read the AuthBoxCrypto public API (`apps/ios/AuthBoxCrypto/Sources/AuthBoxCrypto/*.swift`): seed → master key derivation, item AES-GCM. Reuse, do not reimplement.
2. Wire `VaultSession.provision(masterKey:)` from the seed-derived master key during onboarding.
3. SwiftData store holding ciphertext blobs + metadata only (`Core/Storage`).
4. `Features/Vault`: item list/detail/CRUD + password generator + deterministic derivation. Reuse `apps/ios/AuthBox/Sources/Features/Vault` patterns.
5. Verify: `pnpm run ios:crypto-vectors` parity + xcodebuild test green + UX evidence in notes.md.

## Hard constraints / gotchas
- **Manual UX gate**: the real Touch ID + Secure Enclave round-trip cannot run headless. Provision a key + unlock on the Mac to exercise it (Maurice).
- **Team-deferred entitlements (P1→needs DEVELOPMENT_TEAM)**: app-group `group.com.authbox.shared` + keychain-access-groups + runtime hardened-runtime (ad-hoc disables it). Add when a signing team is configured.
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
