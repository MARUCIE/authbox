# Auth Box — Built-in Authenticator (TOTP / 2FA) Architecture

Status: shipped (iOS), engine RFC-verified
Last updated: 2026-06-03
Scope: iOS app — store TOTP secrets in the vault and generate the rotating codes,
compatible with Google Authenticator and Microsoft Authenticator.

---

## 1. Decision: be the authenticator, RFC 6238 directly

A password manager's natural 2FA feature is to hold the TOTP secret **next to the
password it protects** (the 1Password / Bitwarden pattern) and generate the
rotating 6-digit code in-app. Google Authenticator and Microsoft Authenticator
both implement **RFC 6238 (TOTP)** over **RFC 4226 (HOTP)** — a public, stable
standard. So Auth Box implements the same spec directly; no third-party library,
no account, no network. A secret stored in Auth Box produces the **exact same
code** those apps would, because they all compute the same function.

Note: this is distinct from the **account-level 2FA** that protects login to the
Auth Box *web account* (`enrollTOTP`/`verifyTOTP` in the web/server). This
feature is the vault *storing other services'* TOTP secrets and acting as their
authenticator.

## 2. Engine — `AuthBoxCrypto/TOTP.swift`

Pure value type, built on CryptoKit HMAC. Lives in the shared crypto package
alongside `Seed` / `Wallet`.

| Concern | Implementation |
|---------|----------------|
| HOTP (RFC 4226) | `hotp(counter:)` — HMAC over the 8-byte big-endian counter, dynamic truncation, mod 10^digits |
| TOTP (RFC 6238) | `code(at:)` — counter = floor(unixTime / period) |
| Hash modes | HMAC-SHA1 (default), SHA256, SHA512 via `HMAC<Insecure.SHA1>` / `HMAC<SHA256>` / `HMAC<SHA512>` |
| Digits / period | 6 (default) or 8; 30s (default) |
| Secret ingest | `base32Decode` (RFC 4648, case-insensitive, padding/space tolerant) |
| URI ingest | `parse(_:)` accepts a full `otpauth://totp/Label?secret=...&issuer=...&digits=...&period=...&algorithm=...` URI **or** a bare base32 secret; extracts issuer/account |
| Display | `formattedCode()` → "123 456"; `secondsRemaining(at:)` for the countdown |

The secret is held as raw key bytes (`Data`), decoupled from its base32 encoding —
so the RFC vectors (raw ASCII seeds) and the base32/URI path are each provable
on their own.

## 3. Storage — `VaultItem.otpauth`

One new field on the local SwiftData model:

- `VaultItem.otpauth: String` (default `""`) — the `otpauth://` URI or bare base32
  secret. Default value keeps SwiftData lightweight migration happy for stores
  created before 2FA.
- Mirrored in `VaultItemPayload` (the sync wire format) for cross-device parity.
- Stored exactly like `password` — same at-rest protection (the TOTP secret is as
  sensitive as the password; it is never given weaker handling).

The web shared model (`packages/shared/src/types/vault.ts`) already declares
`LoginItem.totpSecret?` and the importers already parse `otpAuth` from
iCloud/Bitwarden/LastPass/Apple exports — so imported secrets line up with this
field by intent.

## 4. UI

- **Display** (`VaultItemDetailView`): when `TOTP.parse(item.otpauth)` succeeds, a
  "One-Time Password" section renders the live code via `TimelineView(.periodic(by:1))`
  (a pure function of time — never stored, never stale), an issuer label, a
  draining countdown ring (red in the last 5s), and a tap-to-copy button.
- **Add** (`AddItemView`): a "Two-Factor (Authenticator)" section takes the
  `otpauth://` link or base32 key, validates it live (`Valid · code 123 456` /
  warning), and persists it on save.
- **Debug hook** (`AppState --totp-demo-seed`): unlocked vault + one GitHub login
  whose secret (`GEZD…OJQ`) is the RFC 6238 SHA1 seed, for UI tests.

## 5. Verification (2026-06-03)

- `AuthBoxCryptoTests/TOTPTests` — **7 tests pass**, including
  `testRFC6238AppendixBVectors`: all 18 published Appendix B values (6 timestamps
  × SHA1/SHA256/SHA512, 8-digit) match **byte-for-byte**. This is the canonical
  proof the codes equal Google/Microsoft Authenticator output. Plus base32
  (RFC 4648 "foobar" vector), otpauth:// parsing, bare-secret parsing, step
  stability/rollover, and countdown bounds.
- `AuthBoxUITests/TOTPFlowUITests` — **2 tests pass**: the stored secret renders a
  live `\d{3} \d{3}` code on the detail screen; the add flow validates an entered
  key. Screenshots: `state/screenshots/authbox-ios-uxmap/totp-r{1,2,3,4}-*.png`
  (r2 shows the live code "108 658" + countdown ring).
- App builds clean; no existing test depends on the changed `VaultItemPayload`.

## 6. Follow-ups (not blocking)

- **QR scan** — the signature authenticator add flow. `parse(_:)` already accepts
  the QR payload (`otpauth://`); the remaining piece is an AVFoundation camera
  scanner. Device-only (the simulator has no camera), so it was deferred.
- **Web code generation** — the web already stores `totpSecret` and imports
  `otpAuth`, but has no generator yet. A TS port of `TOTP.swift` into
  `packages/crypto` would light up the same live code on the web vault.
- **SHA256/SHA512 + 8-digit issuers** — already supported by the engine; surface
  them in the add UI if a service needs a non-default profile.

---

Maurice | maurice_wen@proton.me
