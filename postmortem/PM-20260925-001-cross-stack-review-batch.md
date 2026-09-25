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

# Round 2 (Go API + macOS deep review, same day)
A second pass covered services/api (never previously reviewed) and apps/macos.
Fixed in the same branch:
- CRITICAL: /auth/login/totp/verify was bound only by email — anyone knowing
  the email could race the victim after their SRP proof and take over the
  session (plus offline-cracking material). Now bound by a single-use random
  loginToken minted at login/verify, ≤3 attempts, constant error strings;
  pending SRP state is fetch-and-delete (also fixes data races on shared
  big.Int state). Clients (web, extension) updated to the new contract.
- TOTP replay: accepted counter step now persisted atomically
  (users.totp_last_counter, migration 012) — same code can't be used twice
  across login/verify/enable/disable.
- Audit chain: appends are now transactional under a per-user advisory lock
  and hash the SAME timestamp that is stored (was hashing service time while
  the DB stored NOW() — false tamper alarms whenever the seconds differed).
  Login outcomes and wallet broadcasts now write audit events (the chain was
  permanently empty — LogEvent had zero callers).
- Vault delta sync: per-item `version` was misused as a global pull cursor
  (new items were silently skipped forever). New monotonic sync_seq column
  (migration 013), cursor + syncToken in the API, SyncPush upserts
  transactionally with a user-ownership guard.
- LoginInit user enumeration (timing + early return) fixed with deterministic
  fake-SRP work for unknown emails; pending map capped; TOTP dev-key fallback
  restricted to local/development/test envs; UpdateItem/UpdateAgent now
  validate like Create (empty ciphertext no longer destroys an item);
  RefreshBalance fans out with errgroup and hard-fails malformed amounts;
  session touches debounced DB-side + hourly expired-session reaper.
- macOS: count-based agent ids collided and trapped the broker's capability
  dictionary on every request (crash loop, persisted); broker answered only
  the FIRST WebSocket message per connection; onboarding accepted checksum-
  invalid mnemonics (silently wrong keys); clipboard secrets now concealed/
  transient with 45s expiry; LockedView gained a recovery-phrase restore path
  (biometric re-enrollment permanently locked users out); deterministic
  generator now derives from the real seed phrase (vault-key-derived
  passwords diverged across platforms); audit head anchor advances only after
  a confirmed file write and updates in place (no delete/add crash window);
  pre-onboarding "unlock" no longer opens the full app with no master key.
- Parity: the TS derivePassword rejection-sampling fix is ported to Swift
  Seed.derivePassword and the pinned cross-platform vectors regenerated —
  the two engines stay byte-identical.

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
TRIGGER_REGEX: WHERE user_id = \$1 AND version >
TRIGGER_REGEX: NSPasteboard\.general\.setString
TRIGGER_REGEX: env != "production"

# Round 3 follow-up (same day): autonomous optimization pass
- iOS vault items are now CIPHERTEXT AT REST: `VaultItem` is a plain in-memory
  class and persistence goes through the new `EncryptedVaultRecord` @Model
  (id + timestamps visible; all content in one AES-256-GCM VaultItemPayload
  blob under the vault key — the same envelope sync uses, mirroring macOS).
  The store moved to a dedicated file (AuthBoxVault.store) and the legacy
  plaintext default.store files are purged best-effort at init; local items
  re-materialize from the CloudKit ciphertext sync.
- /wallet/broadcast now enforces a SERVER-side mainnet step-up: accounts with
  TOTP enabled must present a fresh (replay-protected) code; the web wallet's
  mainnet confirm gained the input. A stolen session token alone can no
  longer move mainnet funds on 2FA accounts.
- macOS: Quick Connect and provider imports no longer fall back to a
  throwaway in-memory store on open failure (write paths fail loudly; the
  provider hub degrades to read-only with a visible error); broker failed-auth
  audit seals are capped per minute so a local flood cannot grow the chain
  unboundedly (denials themselves remain unconditional).
- Go: TOTP replay and SyncPush validation are now pinned by service tests.

# Known remaining risks (documented, not fixed)
- iOS AutoFill extension is built around a plaintext shared-App-Group JSON store (dormant;
  nothing writes it — needs Keychain-access-group key sharing to do properly).
- macOS list metadata (title, username, url, provider) is plaintext at rest with no search
  feature using it; broker audit file/Keychain writes still happen on the main actor.
- Console `ONBOARDING_ENTRY_VIEW` is still recorded in an RSC render (now gated by auth
  middleware and skipped on error re-renders; a client beacon remains the right fix).
- Go: register still returns EMAIL_EXISTS (explicit enumeration, kept for UX); SRP handshake
  state is in-process memory (multi-replica deployments need a shared store; LoginInit is
  still keyed by email between init and verify); agent API keys + policies are minted/stored
  but no gateway endpoint authenticates or evaluates them yet (the MCP bridge is the
  intended consumer).
- iOS at-rest migration note: pre-existing local plaintext stores are deleted, not
  converted — devices that never enabled CloudKit sync lose local-only items. Acceptable
  pre-release (repo no-backward-compat rule) but worth a release note.
- NOTE: earlier revisions of this postmortem claimed the web TOTP path skips M2
  verification — that was wrong; the web client verifies M2 at the login/verify step.

# References
- packages/mcp-protocol/src/proxy-security.ts, policy-engine.ts, server.ts
- packages/crypto/src/wallet-tx.ts, totp.ts, seed.ts, arweave-vault.ts, srp.ts, aes-gcm.ts
- apps/console/middleware.ts, lib/public-telemetry-store.ts, lib/api.ts
- apps/web/app/(vault)/wallet/page.tsx, lib/vault-service.ts
- apps/extension/src/background/index.ts
- apps/ios/AuthBoxCrypto/Sources/AuthBoxCrypto/{TOTP,OTPMigration,WalletTx,VaultBlobCodec,Seed,AES256GCM,SRP}.swift
- apps/ios/AuthBox/Sources/Core/{Storage/KeychainManager,Sync/VaultSyncEngine,Network/APIClient}.swift
- services/api/internal/{repository/pg/vault_repo.go,handler/vault_handler.go}
