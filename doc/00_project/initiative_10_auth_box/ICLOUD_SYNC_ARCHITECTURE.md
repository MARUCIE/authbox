# Auth Box — iCloud Sync & Account Binding Architecture (design)

Status: DESIGN ONLY — blocked on a paid Apple Developer iCloud (CloudKit) container.
Last updated: 2026-06-03
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
the only part that needs the live container + device.

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

## 6. Open decisions (block implementation)

1. **iCloud container availability** — is there a paid Apple Developer account for
   Auth Box with (or able to create) a CloudKit container? Without it, iCloud sync
   cannot be enabled at all; the work stays design-only.
2. **Meaning of 绑定** — confirm it means **(A) binding the vault to the iCloud
   account for cross-device sync** (this document's assumption). Alternatives that
   change scope: (B) biometric binding to unlock — already implemented
   (`AppState.unlockVault(withBiometrics:)`); (C) binding to the Auth Box *web
   account* (a different, server-side identity) — a separate initiative.

## 7. Implementation plan (once §6 is resolved)

1. Add the iCloud/CloudKit capability + container to `AuthBox.entitlements` (+ Dev).
2. `KeychainManager`: make the seed item synchronizable (iCloud Keychain).
3. `VaultSyncEngine` (new): `CKSyncEngine` over `VaultItemBlob` records; encrypt on
   push with `VaultStore.encryptForSync`, decrypt on pull with `decryptFromSync`;
   last-write-wins via `VaultSyncReconciler`. (Both the encrypt/decrypt codec AND the
   reconcile core are DONE and proven ahead of the entitlement — steps 5a/5c below;
   what remains here is the `CKSyncEngine` plumbing that maps CloudKit records ↔
   `SyncState` and ships the blobs the reconciler selects.)
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
