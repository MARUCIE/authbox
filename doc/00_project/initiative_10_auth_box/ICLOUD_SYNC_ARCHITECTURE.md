# Auth Box — iCloud Sync & Account Binding Architecture (design)

Status: SYNC ENGINE SHIPPED + FULLY-PROVISIONED APP ON DEVICE — live CloudKit round-trip is the only remaining (on-device) acceptance step.
Last updated: 2026-06-04

> **2026-06-04 sync-engine milestone**: `VaultSyncEngine` (`CKSyncEngine`, iOS 17+) is
> written, compiles clean under Swift 6 *complete* strict concurrency, is wired into
> `AppState`, and the **fully-provisioned app is installed and launched on the physical
> iPhone 17 Pro Max** (`com.authbox.app`, team `35HKS5847W`). What changed vs. the
> 2026-06-03 milestone:
>
> - **`VaultSyncEngine`** (`AuthBox/Sources/Core/Sync/VaultSyncEngine.swift`): pushes
>   ciphertext blobs on local CRUD, applies pulls with last-write-wins by `updatedAt`,
>   persists `CKSyncEngine.State` in `UserDefaults`. It drives the three already-proven
>   CloudKit-free layers (`VaultBlobCodec` + `VaultSyncReconciler` + `VaultItemPayload`
>   codec). The `recordProvider` (a `@Sendable async` closure) is fed a pre-built
>   `[CKRecord.ID: CKRecord]` snapshot computed on the main actor, so it crosses no actor
>   boundary — the Swift-6-correct pattern (CKRecord is `@unchecked Sendable`).
> - **App Group provisioned autonomously**: `group.com.authbox.shared` was registered and
>   assigned to App ID `com.authbox.app` via browser-use on the Developer portal (the iCloud
>   container `iCloud.com.authbox.vault` was assigned in the prior session). Zero manual
>   action from Maurice — the only human-only gate (portal login) was already satisfied.
> - **Full canonical entitlements now build for device**: the tracked `project.yml` declares
>   iCloud (container + CloudKit) alongside the existing app-group + autofill. `xcodebuild
>   -allowProvisioningUpdates` SUCCEEDED with no override hack; `codesign -d --entitlements`
>   on the installed binary confirms all four: `icloud-container-identifiers =
>   (iCloud.com.authbox.vault)`, `icloud-services = (CloudKit)`, `application-groups =
>   (group.com.authbox.shared)`, `autofill-credential-provider = true`.
> - **Settings toggle wired**: the previously-decorative "Cloud Sync" toggle now drives
>   `AppState.isSyncEnabled` (off by default, Pro-gated), which builds/tears-down the engine.
> - **Runtime smoke test (simulator)**: launched with `-authbox.sync.enabled YES
>   --totp-demo-seed`, the app unlocks the vault, adds an item, and `startSyncIfEnabled()`
>   builds the engine + instantiates `CKSyncEngine` + enqueues the item — and the process
>   stays alive with **zero crash reports**. This proves the `@MainActor` engine + `@Published`
>   toggle + `@Sendable` record-provider closure are runtime-sound, beyond compile-time. The
>   simulator has no iCloud account, so no network send is attempted (expected) — that leg is
>   the device acceptance below.
> - **Test suite now runs through the scheme + zero-knowledge guard added**: the `AuthBoxTests`
>   target (orphaned — never in `project.yml`) and a deterministic `schemes:` block are now declared,
>   so the app-tier sync tests execute via the scheme: `VaultSyncCodecTests` 4 pass, `ProPurchaseTests`
>   3 deterministic pass + 2 StoreKit-round-trip skip (CLI runtime), plus 20 `AuthBoxCrypto` package
>   tests. Running them surfaced a real defect: the SwiftData store, once the app carried the CloudKit
>   entitlement, auto-armed `NSPersistentCloudKitContainer` (`cloudKitDatabase` defaulting to `.automatic`)
>   — it failed to load AND would have mirrored **plaintext** to CloudKit. Fixed with explicit
>   `cloudKitDatabase: .none` (§5.6); A/B-verified the store-load error went present → 0.
>
> **Remaining — the live CloudKit round-trip (on-device acceptance, Maurice-gated).** The
> physical-device UI cannot be driven by automation, so this last step is manual: on the
> iPhone, unlock Pro (sync is a Pro feature), enable Settings → iCloud Sync, add a vault
> item, and confirm an encrypted `VaultItemBlob` record appears in the CloudKit Console for
> container `iCloud.com.authbox.vault` (private DB, `Vault` zone) — and that its fields are
> ciphertext only (no plaintext title/password/otpauth). A second device signed into the
> same Apple ID then converges. This is *acceptance*, not a unit test, exactly like the
> real-StoreKit path; the codec/reconciler layers are unit-tested ahead of it.
Scope: design the SOTA way to sync the vault across a user's Apple devices and
bind it to their iCloud identity, without breaking Auth Box's zero-knowledge model.

> This is the canonical `.md`. The Chinese `.html` companion (via html-style-router,
> with the 3-round visual polish) will be produced once the two open decisions in
> §6 are settled — polishing a design that still has a forking decision and an
> external blocker would be premature.

---

## 1. The hard constraint: zero-knowledge must survive sync

Auth Box is seed-derived and local-first. Vault items are encrypted with a random
32-byte **vault key**, which is itself wrapped by a key derived from the user's
seed (`VaultCrypto`: `encryptVaultItem` → AES-256-GCM `EncryptedPayload`). The
seed lives in the Keychain and never touches disk in plaintext.

iCloud (CloudKit, iCloud Drive, KVS) is **Apple-readable infrastructure**.
Therefore the rule is absolute: **only ciphertext may enter iCloud.** Syncing the
decrypted `VaultItem` (its `password`, `otpauth`, `notes`) — even into the
"private" database — would hand Apple the plaintext vault and destroy the product's
entire security claim. This single constraint determines the whole design.

## 2. Design: CloudKit private DB carrying encrypted blobs

```
VaultItem (plaintext, on-device)
   │  VaultCrypto.encryptVaultItem(vaultKey:, plaintext: JSON(item))
   ▼
EncryptedPayload { ciphertext, nonce, tag }   ← the ONLY thing that leaves the device
   │  CKRecord(recordType: "VaultItemBlob", recordID: item.id)
   ▼
CloudKit private database (per-Apple-ID, end-to-end for our payload because we
encrypted it before handing it over)
```

- **Transport**: CloudKit **private database** (`CKContainer.default().privateCloudDatabase`).
  One `CKRecord` per item, `recordID = item.id`, fields = `ciphertext`/`nonce`/`tag`
  (CKAsset or Data) + `updatedAt`. No searchable plaintext fields.
- **Why CloudKit over SwiftData's automatic CloudKit mirror**: the automatic mirror
  would sync the *model* (plaintext columns). We must sync *blobs we encrypted first*,
  so we drive CloudKit explicitly and keep SwiftData as the local store only.
- **Sync engine**: `CKSyncEngine` (modern) or zone change-tokens — push local changes,
  pull remote, both directions are opaque blobs.
- **Conflict resolution**: last-write-wins on `updatedAt` for v1 (a vault item is
  small and edited rarely); upgrade to field-level merge only if needed. This merge
  decision — the bug-prone heart of any sync engine — is now implemented and proven
  ahead of the transport as a pure value type, `AuthBoxCrypto/VaultSyncReconciler`
  (see §5).
- **Delete**: tombstone via CloudKit record deletion; local delete mirrors up. The
  reconciler models each side as `live(updatedAt)` / `tombstone(deletedAt)` and emits
  per-id `push`/`pull` actions; two tombstones converge with no action, an edit racing
  an older delete resurrects (push), and exact-timestamp ties keep the live side
  (a vault credential is costlier to silently lose than to keep one beat).

## 3. Account binding (绑定)

"Binding" the vault to iCloud has two independent layers, and they must not be
conflated:

1. **Encrypted items → CloudKit private DB** (§2). Bound to the Apple ID by virtue
   of the private database being per-Apple-ID. The vault key is *never* uploaded.
2. **The seed → the other device.** Sync of ciphertext is useless if device B can't
   derive the vault key. The seed is the binding anchor. Two ways:
   - **(a) iCloud Keychain** — store the seed as a Keychain item with
     `kSecAttrSynchronizable = true`. iCloud Keychain is itself end-to-end encrypted
     by Apple under the user's Apple ID + device trust, so the seed syncs across the
     user's devices without Auth Box or Apple seeing it in plaintext. This is the
     "bind to iCloud" experience: sign into iCloud → vault appears.
   - **(b) Manual re-entry** — the user types the 12-word mnemonic on device B. Zero
     reliance on iCloud Keychain; maximum paranoia; worse UX.

   SOTA default: **(a) iCloud Keychain for the seed + CloudKit for the blobs**, with
   (b) always available as the recovery path. The vault key is derived on-device on
   both ends; only the seed (via Apple's E2E Keychain) and ciphertext (via our own
   AES-GCM) ever sync.

## 4. Entitlements & capabilities required

None of these exist in the project today (`AuthBox.entitlements` has only the app
group + autofill provider):

- `com.apple.developer.icloud-container-identifiers` = `iCloud.com.authbox.vault`
- `com.apple.developer.icloud-services` = `CloudKit`
- `com.apple.developer.ubiquity-kvstore-identifier` (only if KVS is used)
- A CloudKit **container** provisioned in the Apple Developer portal (requires a
  **paid** Apple Developer Program membership).
- The seed Keychain item flipped to `kSecAttrSynchronizable` (a `KeychainManager` change).

## 5. Why this can't be proven in the simulator

Same class of blocker as the StoreKit half of the payment task:

- CloudKit requires a real iCloud account signed in and the provisioned container;
  the simulator's iCloud support is partial and the container must exist server-side.
- iCloud Keychain sync is only observable across ≥2 real devices on the same Apple ID.
- The entitlement itself needs the paid membership + portal configuration before the
  app will even launch with iCloud enabled.

So the encryption/serialization layer can be unit-tested on-device-independently,
but the **CloudKit round-trip and the cross-device Keychain sync are device + account
+ entitlement gated** and verify-pending, exactly like the real-StoreKit tests.

**Proven now (2026-06-03)** — `AuthBoxTests/VaultSyncCodecTests`, 4 tests pass against the
existing `VaultStore.encryptForSync` / `decryptFromSync` codec (no entitlement needed):
full round-trip preserves every field incl. the `otpauth` 2FA secret; the encrypted blob
contains **no plaintext** (the zero-knowledge property asserted directly); encryption is
non-deterministic (fresh AES-GCM nonce); a wrong vault key cannot decrypt (GCM tag fails).
The cryptographic boundary the CloudKit transport will ride on is therefore verified ahead
of the entitlement.

**Also proven now (2026-06-03)** — `AuthBoxCryptoTests/VaultSyncReconcilerTests`, 15 tests
pass, exercising the pure `VaultSyncReconciler.reconcile(local:remote:)` across every state
pair: live-only push/pull, tombstone-only no-op, live-vs-live LWW both directions, the
edit/delete conflicts (newer edit resurrects, newer delete wins), both-tombstoned convergence,
exact-timestamp ties (live wins), and a mixed multi-item merge sorted deterministically. The
merge core and the crypto codec — the two parts that don't need CloudKit — are now both green;
only the network round-trip and cross-device Keychain remain entitlement-gated.

**And the CloudKit wire layer (2026-06-03)** — `AuthBoxCryptoTests/VaultBlobCodecTests`, 5 tests
pass against `VaultBlobCodec`, which maps a vault item ↔ a `CKRecord` carrying only ciphertext.
`CKRecord` instantiates offline, so this is provable without a container: round-trip preserves
payload + id (restored from `recordName`) + `updatedAt`; the record's `ciphertext`/`nonce`/`tag`
fields contain **no plaintext** (password, TOTP secret, username all absent — zero-knowledge on
the wire asserted directly); encryption is non-deterministic; a wrong key fails to decode. The
three CloudKit-free layers — merge (`VaultSyncReconciler`), crypto codec (`VaultStore`), and wire
mapping (`VaultBlobCodec`) — are all proven; the `CKSyncEngine` orchestration that drives them is
**now written and runtime-proven** (`VaultSyncEngine`, see the 2026-06-04 milestone), so the only
part still needing a live iCloud account is the network round-trip itself (on-device acceptance).

> **Test runnability fixed (2026-06-04):** these app-tier tests (`AuthBoxTests`) previously could not
> run — the `AuthBoxTests` target was never declared in `project.yml` and the shared scheme that
> referenced it was a hand-committed file every `xcodegen generate` deleted. The target + a generated
> `schemes:` block are now in `project.yml`, so `AuthBoxTests/VaultSyncCodecTests` (4 pass) and
> `ProPurchaseTests` (3 deterministic pass, 2 StoreKit round-trip skip on the CLI runtime) run through
> the scheme. The pure `AuthBoxCrypto` package tests (`VaultBlobCodecTests` 5 + `VaultSyncReconcilerTests`
> 15 = 20 pass) already ran via `swift test`.

### Seed-sync security finding (2026-06-03)

The seed is stored with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` + a `.biometryCurrentSet`
access control (`KeychainManager.storeSeed`). That is **fundamentally incompatible** with
`kSecAttrSynchronizable` (iCloud Keychain): a synchronizable item can be neither *ThisDeviceOnly*
nor biometry-bound. §3's "one-line flip to synchronizable" would in reality be a **downgrade** of
the master secret's protection (dropping the per-access Face ID gate + device-only binding).

SOTA-secure resolution adopted: **sync the encrypted blobs via CloudKit; keep the seed biometric +
device-local.** Cross-device seed transfer uses §3 option (b) — manual mnemonic re-entry on device
B (the "max paranoia" path) — preserving the strong on-device protection. iCloud-Keychain seed sync
(§3 option (a), the seamless "sign in → vault appears" UX) stays an **explicit opt-in** for later,
traded against the weaker protection, never a silent default. So `KeychainManager` is left untouched
by sync work, which also avoids the risky synchronizable-attribute migration.

### SwiftData CloudKit-mirroring finding (2026-06-04) — `cloudKitDatabase: .none`

Adding the CloudKit entitlement (for `CKSyncEngine`) silently armed a *second, unwanted* CloudKit
mechanism. `VaultStore`'s `ModelConfiguration` did not specify `cloudKitDatabase`, so it defaulted to
`.automatic` — which turns on `NSPersistentCloudKitContainer` the moment the app carries the CloudKit
entitlement. Two consequences surfaced the instant the entitlement landed:

1. **Store-load failure (functional):** `NSPersistentCloudKitContainer` requires every model attribute
   to be optional or defaulted; `VaultItem` is not, so the store failed to load at runtime
   (`SwiftDataError.loadIssueModelContainer`, "CloudKit integration requires that all attributes be
   optional…"). Caught by a real app launch during `AuthBoxTests/VaultSyncCodecTests`, not by compile.
2. **Zero-knowledge violation (security, the dangerous one):** the naive fix the error message invites —
   make all attributes optional — would let SwiftData *succeed* at mirroring the **plaintext** `VaultItem`
   model straight to CloudKit, bypassing `VaultBlobCodec` and uploading every password/TOTP secret in
   clear. That is the exact opposite of the product's whole security claim.

Resolution: set **`cloudKitDatabase: .none`** explicitly on the `ModelConfiguration`. The local SwiftData
store is now provably local-only; the sole CloudKit traffic is `CKSyncEngine` uploading AES-GCM ciphertext
blobs. Verified by an A/B launch: the CloudKit-integration error count went from present → **0** after the
change, and the app process launches and stays alive. This is the SwiftData-tier counterpart to the
seed-sync finding: the zero-knowledge boundary is enforced by what we *opt out of*, not only by what we
encrypt. (Lesson: a capability entitlement can change a default in an unrelated layer — `.automatic` complects
"has entitlement" with "mirror this store." De-complect by being explicit.)

## 6. Open decisions (block implementation)

1. **iCloud container availability** — ✅ **RESOLVED 2026-06-03**: a paid Apple Developer
   membership exists (team `35HKS5847W`). The container `iCloud.com.authbox.vault` is not
   yet created; creating it + enabling the CloudKit capability is the one remaining
   Apple-ID action (Xcode Signing & Capabilities or the portal — the CLI cannot register
   it on the existing App ID). Once it exists, the `CKSyncEngine` step (§7.3) is unblocked.
2. **Meaning of 绑定** — confirm it means **(A) binding the vault to the iCloud
   account for cross-device sync** (this document's assumption). Alternatives that
   change scope: (B) biometric binding to unlock — already implemented
   (`AppState.unlockVault(withBiometrics:)`); (C) binding to the Auth Box *web
   account* (a different, server-side identity) — a separate initiative.

## 7. Implementation plan (status as of 2026-06-04)

1. ✅ **DONE** — iCloud/CloudKit capability + container in `project.yml` entitlements (+ Dev portal),
   alongside app-group + autofill; `codesign -d` confirms all four on the device binary.
2. ❌ **REJECTED (superseded)** — making the seed item synchronizable is *not* done and will not be:
   per the seed-sync security finding (§5.5), `kSecAttrSynchronizable` is incompatible with the seed's
   device-only + biometry-bound protection. The seed stays device-local; cross-device transfer is manual
   mnemonic re-entry. Also note `cloudKitDatabase: .none` on the SwiftData store (§5.6) — the local store
   must never mirror to CloudKit either.
3. ✅ **DONE** — `VaultSyncEngine` (`AuthBox/Sources/Core/Sync/VaultSyncEngine.swift`): `CKSyncEngine`
   over `VaultItemBlob` records; encrypt on push via `VaultBlobCodec`, decrypt on pull, last-write-wins
   via `VaultSyncReconciler`. Compiles under Swift 6 complete strict concurrency; runtime-smoke-tested.
4. Wire SwiftData local store ↔ sync engine; surface sync state + a manual toggle in
   Settings (off by default until the user opts in).
5. Prove: (a) **DONE** — blob round-trip + zero-knowledge unit tests in-sim
   (`AuthBoxTests/VaultSyncCodecTests`, 4 pass). (b) CloudKit round-trip + cross-device
   Keychain on real devices (XCTSkip in-sim, auto-run on device), with screenshots.
   (c) **DONE** — the pure merge/conflict logic (`AuthBoxCryptoTests/VaultSyncReconcilerTests`,
   15 pass). Only (b) is entitlement/device-gated.
6. Then produce the Chinese `.html` companion (2份制) and the 3-round visual polish.

---

Maurice | maurice_wen@proton.me
