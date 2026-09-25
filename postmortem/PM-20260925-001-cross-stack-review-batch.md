---
Title: PM-20260925-001 Cross-Stack Adversarial Review Batch (SSRF bypass, funds-path, policy engine)
Status: fixed
Owner: ai-agent
LastUpdated: 2026-09-25
Scope: mcp-protocol, crypto, console, web, extension, ios, api
---

# Summary
A four-track adversarial code review (crypto / mcp-protocol+shared / web apps / Swift apps)
surfaced ~30 confirmed defects. The highest-impact classes: IPv4-mapped IPv6 forms bypassing
the proxy SSRF blocklist, a BTC send that fails (TS) or loses change visibility (web) with
multi-address UTXOs, a step-up approval flow that was dead code, and unauthenticated
admin/telemetry surfaces in the console.

# Symptoms
- `sanitizeProxyRequest` allowed `::ffff:169.254.169.254`, `::ffff:172.16.x.x`, `64:ff9b::/96`,
  hex-mapped forms, and plaintext `http:` destinations.
- `buildBtcTransaction` threw `No inputs signed` whenever coin selection excluded a candidate UTXO.
- Web wallet never registered the BTC change address; balance dropped to near-zero after a send.
- step_up policies hard-denied (pendingApprovalId dropped in `evaluate()`); rate limits were
  wiped every 5 minutes by a blanket `resetCounters()`.
- Any JSON-RPC frame `null` crashed the MCP vault server (destructure outside try/catch,
  unawaited async handler).
- Console admin pages (platform creation with server-held bearer token) were publicly
  reachable and crawlable; telemetry ingest had no field caps and sync fs on the request path.
- iOS: hostile otpauth `digits`/`period` values trapped at render time (crash loop after sync);
  Google-Authenticator migration payloads could trap via `Int(len)` overflow; RNG/KDF status
  codes ignored; CloudKit LWW used push time instead of edit time and dropped
  `serverRecordChanged` losers.

# Root Cause
- Blocklists written against string prefixes instead of parsed address semantics.
- Signing loop shape (`for key: tx.sign(key)`) did not match the library contract
  (`sign` throws when a key matches no input).
- Policy engine rebuilt deny results, silently dropping fields (`pendingApprovalId`).
- Trust boundaries not enforced at ingest: unauthenticated routes accepted unbounded
  attacker-chosen strings; untrusted QR/server integers converted with trapping initializers.

# Fix
- Parse IPv6 into groups; apply IPv4 rules to every embedded-IPv4 form; https-only proxy;
  header-value CRLF validation; sanitize-before-audit ordering; loopback bind for the WS server.
- Per-outpoint `signIdx` with per-address key dedupe (also removes O(N²) sighash work).
- Change address stashed in the send review and registered watch-only after broadcast.
- `evaluate()` surfaces step-up only when all other policies pass; per-policy rate-limit
  windows with expiry-only pruning; JSON-RPC shape validation + `.catch` on the handler.
- Console: middleware gate + robots disallow for admin routes, fail-closed admin token,
  telemetry field caps / ts clamping / buffered async appends / bounded counter maps.
- iOS: range-validate digits (6–8) and period (1–300) at parse AND clamp in init;
  `Int(exactly:)` for protobuf lengths; `precondition` on `SecRandomCopyBytes` /
  `CCKeyDerivationPBKDF`; real `updatedAt` for LWW; `serverRecordChanged` merge + re-queue
  on the server record's change tag.

# Prevention
- SSRF blocklists must operate on parsed addresses, never string prefixes; every embedded-IPv4
  IPv6 form routes through the IPv4 rules.
- Any funds-path test suite must include multi-UTXO / multi-address fixtures (single-UTXO
  tests masked the signing bug).
- Fields on structured results (decisions, errors) must be propagated by spreading the result,
  not rebuilt by hand.
- Untrusted integers (QR, explorer, server JSON) use non-trapping conversions
  (`Int(exactly:)`, decode-as-target-type) plus range validation.

# Triggers (machine-matchable)
TRIGGER_REGEX: startsWith\(["']::ffff:
TRIGGER_REGEX: for\s*\(const\s+\w+\s+of\s+privKeys\)\s*tx\.sign
TRIGGER_REGEX: resetCounters\(\)
TRIGGER_REGEX: btoa\(String\.fromCharCode\(\.\.\.
TRIGGER_REGEX: decodeURIComponent\(.*searchParams
TRIGGER_REGEX: appendFileSync\(.*telemetry
TRIGGER_REGEX: UInt32\(\$0\.vout\)
TRIGGER_REGEX: Data\(base64Encoded:[^)]*\)!
TRIGGER_REGEX: SecRandomCopyBytes[\s\S]{0,80}\}\s*$
TRIGGER_PATH: packages/mcp-protocol/src/proxy-security.ts
TRIGGER_PATH: packages/crypto/src/wallet-tx.ts
TRIGGER_PATH: apps/ios/AuthBoxCrypto/Sources/AuthBoxCrypto/TOTP.swift

# Known remaining risks (documented, not fixed in this batch)
- iOS SwiftData vault items are stored PLAINTEXT at rest (VaultItem.swift) — needs the macOS
  ciphertext-column design; architectural change.
- iOS AutoFill extension is built around a plaintext shared-App-Group JSON store (dormant).
- TOTP login (`/auth/login/totp/verify`) is not cryptographically bound to the SRP handshake
  and skips M2 verification (web + extension + Go server change).
- DNS-rebinding TOCTOU between `assertPublicDestination` and the bridge's own fetch — the
  bridge must pin the vetted IPs in its lookup hook.
- Console `ONBOARDING_ENTRY_VIEW` is still recorded in an RSC render (now gated by auth
  middleware and skipped on error re-renders; a client beacon remains the right fix).
- Web seed-vault create/restore flows land on /login (no local-first session); "Derive
  Password" derives from the random vault key, contradicting its seed-recovery promise.
- iOS WalletView re-derives HD addresses inside SwiftUI body per render (perf).

# References
- packages/mcp-protocol/src/proxy-security.ts, policy-engine.ts, server.ts
- packages/crypto/src/wallet-tx.ts, totp.ts, seed.ts, arweave-vault.ts, srp.ts, aes-gcm.ts
- apps/console/middleware.ts, lib/public-telemetry-store.ts, lib/api.ts
- apps/web/app/(vault)/wallet/page.tsx, lib/vault-service.ts
- apps/extension/src/background/index.ts
- apps/ios/AuthBoxCrypto/Sources/AuthBoxCrypto/{TOTP,OTPMigration,WalletTx,VaultBlobCodec,Seed,AES256GCM,SRP}.swift
- apps/ios/AuthBox/Sources/Core/{Storage/KeychainManager,Sync/VaultSyncEngine,Network/APIClient}.swift
- services/api/internal/{repository/pg/vault_repo.go,handler/vault_handler.go}
