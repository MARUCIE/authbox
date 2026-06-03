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

## 6. Import, scan, and migrate accounts

Scan, import, and migrate are one problem — parse a string into `[TOTP]` — so
they share one surface (`AuthBoxCrypto/OTPImport.swift`):

| Input | Source | Handling |
|-------|--------|----------|
| `otpauth-migration://offline?data=...` | Google Authenticator "Export / Transfer accounts" QR | base64 → protobuf `MigrationPayload` → many `TOTP` |
| single `otpauth://totp/...` | a service's 2FA QR / pasted link | `TOTP.parse` → one `TOTP` |
| newline-separated list | pasted export | each line → `TOTP`, invalid skipped |

- **Migration protobuf** is decoded by a minimal, dependency-free wire-format
  reader (`ProtobufReader`: varint + length-delimited only; unknown fields
  skipped so newer exports degrade gracefully). No SwiftProtobuf dependency —
  same "implement the standard by hand, stay testable" posture as `TOTP`.
  Algorithm/digit/type enums are mapped to `TOTP`; HOTP and MD5 accounts are
  skipped (Auth Box is time-based, MD5 is unsupported).
- **Round-trip storage**: a decoded/scanned account has no original URI string,
  so `TOTP.otpauthURI()` (+ `base32Encode`) serializes it back to a canonical
  `otpauth://` URI for `VaultItem.otpauth`, which re-parses for display.
- **UI**: `ImportTOTPView` (vault toolbar → "Scan & Import 2FA") offers a camera
  scan **or** a paste field, previews every account found with a live code, and
  imports them in one tap. `AddItemView`'s Two-Factor section also has a "Scan
  QR code" button for single-account add. `QRScannerView` wraps an AVFoundation
  `AVCaptureMetadataOutput` (`.qr`); camera usage is declared via
  `INFOPLIST_KEY_NSCameraUsageDescription`.

Verification: `AuthBoxCryptoTests/OTPMigrationTests` — 9 tests (migration single/
multi/skip-HOTP-MD5/malformed, single & multiline otpauth, base32 RFC 4648
vector, `otpauthURI` round-trip tied to the RFC code). `AuthBoxUITests/
TOTPImportFlowUITests` — the paste→preview→import→appears-in-vault chain (the
scanner feeds the same `OTPImport.parse`, so the camera-less path proves the UI).
Screenshots: `totp-import-r{1,2,3}-*.png`.

## 7. Follow-ups (not blocking)

- **iCloud sync + account binding** — see `ICLOUD_SYNC_ARCHITECTURE.md`. The SOTA
  zero-knowledge design (sync AES-256-GCM blobs via a CloudKit private database,
  vault key never leaves the device) is decided, but enabling CloudKit needs a
  paid Apple Developer iCloud container and is only verifiable on a real device
  signed into iCloud — out of reach of the simulator, like the StoreKit half of
  the payment task.
- **Web code generation** — DONE at the engine + UI layer. `packages/crypto/src/totp.ts`
  is a functional TS port of `TOTP.swift` (`@noble/hashes`, same RFC 6238 spec), proven by
  `totp.test.ts` against the **same 18 Appendix B vectors** the Swift suite uses — a
  cross-platform parity proof (identical codes on iOS and web). `password-detail.tsx` renders
  a live `TotpRow` (per-second tick via `useEffect`/`setInterval`, mirror of the iOS
  `TimelineView`), reading `data.otpAuth`/`data.totpSecret`. Deferred: a live render screenshot
  needs the running authenticated web app with a real vault item (auth/data-gated, not
  logic-gated).
- **Web import + migration** — DONE. `packages/crypto/src/otp-migration.ts` is the TS port of
  `OTPImport.swift`: `parseOTPImport(raw)` handles a Google Authenticator
  `otpauth-migration://offline?data=...` export (base64 + the same minimal dependency-free
  `ProtobufReader` — varint + length-delimited, unknown fields skipped, HOTP/MD5 accounts
  dropped), a single `otpauth://` URI, or a newline-separated list. Proven by
  `otp-migration.test.ts` — 10 tests with an in-test protobuf **encoder** (the decoder's mirror
  image) plus the **same RFC 6238 anchor (287082)** the iOS suite uses, so the decode is
  non-coincident on both wire format and HMAC. The web `ImportDialog` now offers a "Paste
  authenticator export" textarea alongside the file upload; pasted accounts convert to the same
  `LoginImportItem[]` and flow through the existing preview/import path. Fixed a latent drop in
  the same change: `handleImport` never forwarded `otpAuth` to `createVaultItem`, so CSV/JSON
  imports (Bitwarden/LastPass/Apple) that parse a 2FA secret were silently losing it on write.
  Verified: crypto suite **106 passed / 2 skipped**, `tsc --noEmit` clean on the changed web
  files (the lone `globals.css` side-effect error is a pre-existing bare-`tsc` artifact,
  proven independent by a stash-bisect), and a full `next build` compiles + prerenders 17/17
  pages. Deferred: a live import screenshot is auth-gated like the render path.
- **Web QR-camera scan** — DONE. `components/vault/qr-scanner.tsx` is the web mirror of the iOS
  `QRScannerView`: `@zxing/browser`'s `BrowserQRCodeReader.decodeFromVideoDevice` wraps
  getUserMedia + the frame loop + QR decode (works across browsers without a hand-rolled canvas
  pump), and the decoded string is fed to the same proven `parseOTPImport` — so a single
  service QR and a Google Authenticator export QR both flow through one path. The `ImportDialog`
  upload step now has a "Scan QR code" button (a `scan` step) beside the paste field; a scanned
  non-OTP QR parses to nothing and drops back with an error. Camera failures (denied permission,
  no camera, insecure non-HTTPS context) surface inline; the paste path is the universal
  fallback. The decode-to-accounts core is proven headlessly (the 106-test crypto suite); the
  camera seam itself is verified by construction + `next build` (no SSR crash — the browser-only
  zxing code is gated behind `'use client'` + `useEffect`), with a live camera scan deferred
  (needs a real camera + authed app), the same honesty ceiling as the iOS scanner whose UI test
  feeds `OTPImport.parse` directly.
- **SHA256/SHA512 + 8-digit issuers** — already supported by the engine; surface
  them in the add UI if a service needs a non-default profile.

---

Maurice | maurice_wen@proton.me
