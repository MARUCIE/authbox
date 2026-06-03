# Auth Box — iOS Payment / In-App Purchase Architecture

Status: shipped (entitlement logic) + verified-pending-device (StoreKit round-trip)
Last updated: 2026-06-03
Scope: iOS app (`apps/ios`), Pro upgrade monetization

---

## 1. Decision: StoreKit 2 direct, one-time non-consumable

Apple **requires** In-App Purchase for unlocking digital functionality; a
Stripe/card flow for the same entitlement is rejected at App Review. RevenueCat
is a wrapper *over* StoreKit, not an alternative — it adds a server dependency
and a vendor cut we do not need for a single one-time product. So the app talks
to **StoreKit 2 directly**.

| Choice | Value | Rationale |
|--------|-------|-----------|
| Framework | StoreKit 2 (`Product`, `Transaction`, `VerificationResult`) | First-party, async/await, on-device receipt verification |
| Product | `com.authbox.pro` | Single SKU |
| Type | Non-consumable, one-time | "$29 once, no subscription" — matches the privacy-first, no-recurring-billing positioning |
| Price | $29.99 (App Store tier) / `$29` UI fallback | Paywall reads the real localized price; falls back to `$29` before the product resolves |
| Backend | none | The app is local-first; entitlement lives in StoreKit + a local cache flag |

## 2. Product model — what Pro unlocks

Free tier (always available): unlimited local passwords, seed-phrase recovery,
Face ID unlock, Apple Passwords import, password generator, up to 5 API keys.

Pro (`com.authbox.pro`, one-time): unlimited API keys, **MCP Agent Gateway**,
Arweave backup, multi-device sync, all 13 import sources, audit log.

Source of truth for the matrix: `ProManager.canUseFeature(_:)` and the
`ProFeature` enum in
`apps/ios/AuthBox/Sources/Core/Storage/ProManager.swift`. The paywall's visible
comparison table (`ProUpgradeView`) must mirror this enum exactly.

## 3. Entitlement flow

```
                          ┌────────────────────────── launch ──────────────────────────┐
                          │ ProManager.init():                                          │
                          │   isPro = UserDefaults["authbox_pro_unlocked"]  (cache read) │
                          │   Task { loadProduct(); verifyEntitlement() }                │
                          └─────────────────────────────────────────────────────────────┘

  paywall tap → ProManager.purchase()
     ├─ loadProduct() if needed        → Product.products(for: ["com.authbox.pro"])
     ├─ product.purchase()             → StoreKit purchase sheet (Apple)
     ├─ checkVerified(result)          → VerificationResult.verified branch only
     ├─ transaction.finish()
     └─ unlock()  ─────────────────────┐
                                        │
  background: Transaction.updates ──────┤→ unlock()      (out-of-band purchases / renewals)
  launch:     Transaction.currentEntitlements ──┤→ unlock()  (verifyEntitlement)
  restore:    AppStore.sync() → verifyEntitlement() ──┘

  unlock(): isPro = true ; UserDefaults["authbox_pro_unlocked"] = true
            → every canUseFeature(.pro*) returns true
            → cache makes the entitlement survive the next cold launch
```

`unlock()` is the single convergence point of every StoreKit path. Verification
is strict: only `VerificationResult.verified` unlocks; `.unverified` throws.

Key files:
- `apps/ios/AuthBox/Sources/Core/Storage/ProManager.swift` — StoreKit 2 logic, entitlement, gates
- `apps/ios/AuthBox/Sources/Features/Settings/ProUpgradeView.swift` — paywall UI (crown, FREE/PRO matrix, dynamic price, CTA)
- `apps/ios/AuthBox/Sources/Features/Settings/SettingsView.swift` — first wired gate: Cloud Sync toggle springs back + opens the paywall for free users
- `apps/ios/AuthBox/Configuration.storekit` — local StoreKit test config (product `com.authbox.pro`, `$29.99`)

## 4. Test strategy — two halves, proven separately

The payment system splits into a half the app owns and a half Apple owns. They
are verified independently.

### 4.1 Entitlement logic (app's half) — deterministic, always runs

`apps/ios/AuthBoxTests/ProPurchaseTests.swift` drives the **real** `ProManager`
methods (no stubs) and asserts the whole system:

- `testFreeTierGating` — the free/Pro matrix matches the paywall.
- `testUnlockFlipsEntireSystem` — calling the real `unlock()` flips `isPro`,
  opens all six Pro features, and persists the cache flag under the exact key
  `init()` restores from.
- `testCachedEntitlementSurvivesRelaunch` — a purchased user stays Pro from the
  local cache on the next cold launch without re-hitting StoreKit.

These need no App Store and no StoreKit daemon, so they run on any runtime.

### 4.2 StoreKit round-trip (Apple's half) — skips under the simulator regression

`testRealStoreKitPurchaseUnlocksPro` and `testRealStoreKitRestoreReDetectsEntitlement`
exercise the full API: `Product.products(for:)` → `purchase()` →
`Transaction.currentEntitlements` → `unlock()`. They **`XCTSkipIf`** (not fail)
when the runtime can't deliver the product, citing the regression below. They
auto-run as real end-to-end proofs the moment the environment can sync the
config.

## 5. Known blocker — iOS 26.5 simulator + `xcodebuild test` CLI

On the public **iOS 26.5** simulator runtime, running tests via the
`xcodebuild test` **CLI** does **not** sync the `.storekit` configuration to the
simulator's StoreKit daemon. Empirically verified on 2026-06-03 (Xcode 26.5,
build 17F42):

- `Product.products(for: ["com.authbox.pro"])` → `count = 0` (no throw)
- `SKTestSession.buyProduct(identifier:)` → throws `notEntitled`
- The `.storekit` file IS bundled and `SKTestSession` IS created — the config
  simply never reaches the daemon.

This is an Apple tooling regression, not a config or code defect. The Xcode IDE
(Cmd+U) uses an internal DVTDevice sync path the public CLI does not invoke.

### How to run the real StoreKit proof

Any one of:
1. **Xcode IDE** — open `apps/ios/AuthBox.xcodeproj`, Cmd+U. The IDE syncs the
   config; the two skipped tests run for real.
2. **iOS 26.1 simulator** — install the older runtime and target it; the CLI
   sync works there.
3. **Device sandbox** — sign with a team, create the product in App Store
   Connect (or attach the `.storekit` via the Run scheme), purchase with a
   sandbox Apple ID.

The Run scheme keeps `Configuration.storekit` referenced in `LaunchAction`, so a
manual Run (Cmd+R) in the IDE shows the real price and a working purchase sheet.

## 6. Verification evidence (2026-06-03, iOS 26.5 simulator, CLI)

- `AuthBoxTests`: **5 tests, 3 passed, 2 skipped, 0 failures** — entitlement
  logic proven; StoreKit round-trip skipped with the regression citation.
- `AuthBoxUITests/PaywallFlowUITests`: **passed** — paywall renders (crown,
  "Auth Box Pro", full FREE/PRO matrix incl. MCP Agent Gateway, price, CTA), and
  the Cloud Sync gate springs back for a free user.
- Visual: `state/screenshots/authbox-ios-uxmap/paywall-r{1,2,3}-*.png`
  (1206×2622). R3 shows the paywall with the `$29` fallback (expected under the
  regression; real localized price renders on device / IDE / 26.1).

## 7. Pre-submission checklist (App Store Connect)

- [ ] Create `com.authbox.pro` non-consumable in App Store Connect, price tier $29.99.
- [ ] Localize display name "Auth Box Pro" + description (match `Configuration.storekit`).
- [ ] Run the two `testRealStoreKit*` tests in Xcode IDE / on device — confirm they no longer skip.
- [ ] Manual sandbox purchase + Restore on a real device.
- [ ] Verify the paywall shows the real localized price (not the `$29` fallback).

---

Maurice | maurice_wen@proton.me
