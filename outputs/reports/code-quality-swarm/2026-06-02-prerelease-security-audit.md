# Auth Box — Pre-Release Adversarial Security Audit

- **Date:** 2026-06-02
- **Pinned commit:** `c2a72ce` (read-only audit; no source mutated)
- **Method:** 6 surface auditors (attacker mindset) fanned out sequentially; every High/Critical finding re-checked by an independent adversarial verifier instructed to *refute* by default.
- **Participants (workflow agents):** crypto-ts, macos-se-vault, broker-policy, provider-hub, go-api, web-extension auditors + per-finding verifiers (15 agents, 258 tool calls, 2.17M tokens).
- **Scope note:** This is an integrity audit of the codebase as committed. It excludes the 9 already-fixed P5 findings (SEC-001…009) and the earlier Go/web audit, except where a prior fix was found incomplete/bypassable.

---

## Executive Summary

1. **One Critical release-blocker (confirmed):** the provider health-check has **no destination-domain allowlist** — importing an attacker-crafted `.env` and clicking "verify" exfiltrates the live, plaintext provider API key to any attacker host (`AUD-SSRF-01`). This defeats the guard's entire purpose and must be fixed before distribution.
2. **Three High findings (all confirmed by the verifier):** SSRF guard bypassable via IPv6/alternate IP encodings (reaches loopback + cloud metadata) `AUD-SSRF-02`; all API rate-limiting keyed on spoofable `X-Forwarded-For` with no trusted-proxy allowlist `AUD-AUTH-02`; the broker audit hash-chain detects mutation/reorder but **not suffix-truncation or deletion**, so the SEC-002 tamper-evidence guarantee is over-claimed `BROKER-AUDIT-01`.
3. **The adversarial verifier overturned 4 alarming findings.** All four web-extension Critical/High reports ("any web page drives privileged vault handlers / steals passwords") were **refuted**: Chrome MV3 messaging isolation (no `externally_connectable`, isolated worlds, a non-relaying content script) blocks the claimed page→background attack path. They are downgraded to latent defense-in-depth gaps, not exploitable flaws. Reporting this honestly is the point of the verification layer.
4. **Core cryptography is sound.** CSPRNG sourcing, AES-256-GCM nonce uniqueness, HD domain separation, Argon2id parameters (256 MB / 3 iters), SRP-6a correctness + constant-time proof compare, and the server-side zero-knowledge invariant (only encrypted blobs stored/returned/logged) all audited clean. The findings are about *integrity binding, rate-limiting, SSRF, and forensic durability* — not broken primitives.
5. **Net effective tally (post-verdict):** 1 Critical · 3 High · 10 Medium · 3 Low · 1 Info · 4 Refuted (22 raw findings).

| Severity | Count | IDs |
|---|---|---|
| Critical | 1 | AUD-SSRF-01 |
| High | 3 | AUD-SSRF-02, AUD-AUTH-02, BROKER-AUDIT-01 |
| Medium | 10 | AUD-CRYPTO-01, AUD-CRYPTO-02, API-AUDIT-01, AUD-AUTH-01 (↓from High), AUD-DOS-01, AUD-POLICY-01, AUD-SSRF-03, AUD-EXT-05, AUD-EXT-06, AUD-EXT-07 |
| Low | 3 | AUD-CRYPTO-03, AUD-SE-VAULT-01, AUD-POLICY-02 |
| Info | 1 | AUD-CRYPTO-04 |
| Refuted | 4 | AUD-EXT-01, AUD-EXT-02, AUD-EXT-03, AUD-EXT-04 |

---

## Synthesis (by theme, MECE)

### A. SSRF / API-key exfiltration — the Critical cluster (provider-hub)

`isSafeEndpoint` (CredentialHealth.swift:319-344) is a **deny-list** ("not internal" ⇒ "safe"), and the openai/posthog/langfuse probes interpolate a user-supplied `base_url`/`host` into the URL while always attaching `Authorization: Bearer <api_key>`.

- **AUD-SSRF-01 (Critical, confirmed):** No domain allowlist. `https://evil.attacker.com/v1/models` passes the guard; one click on "verify" after importing a crafted `.env` sends the real key to the attacker. Verifier traced the full path import → store verbatim → `check()` → `transport.send()` with no validation.
- **AUD-SSRF-02 (High, confirmed):** Even the deny-list is incomplete — `[::ffff:127.0.0.1]`, `[0:0:0:0:0:0:0:1]`, `2130706433`, `0x7f000001`, `2852039166`→169.254.169.254 all return ALLOW (verifier compiled the real guard + ran `getaddrinfo`). Reaches loopback services and cloud metadata.
- **AUD-SSRF-03 (Medium):** `URLSession.shared` follows 3xx redirects with the key header attached; only the initial URL is guarded → redirect + DNS-rebinding TOCTOU.

**Root fix:** replace the deny-list with a positive provider-domain allowlist; for self-hosted base URLs require explicit per-credential host confirmation surfaced in the UI; add a redirect-validating `URLSessionTaskDelegate` that strips auth headers cross-origin.

### B. Audit / forensic integrity (broker + go-api)

- **BROKER-AUDIT-01 (High, confirmed):** `verify()` (AuditLog.swift:134-145) checks only retained-entry linkage — no expected length/head anchor. An empty chain or any valid *prefix* returns `true`, and the UI then shows a green "chain intact" shield. Deleting/truncating `audit-chain.jsonl` erases the record of a malicious "Allow" with zero tamper-evidence. The SEC-002 comment "any edit/truncation/reorder is caught" is **false for truncation/deletion**. Fix: anchor `(seq, head-hash)` in the Keychain/Secure Enclave and require a match on load.
- **API-AUDIT-01 (Medium):** `AuditService.LogEvent` is **dead code** (zero call sites; only read-only routes wired). The server never writes an audit event, so `/audit/verify` is vacuously `valid, verified=0`. The hash input also omits `user_id`/`metadata` and is unkeyed (DB-write access can forge a consistent chain). Fix: wire `LogEvent` into security-relevant flows; HMAC-key the chain.
- **AUD-DOS-01 (Medium):** rate-limit is evaluated *inside* policy eval, i.e. *after* token auth; unknown/bad-token denials still synchronously append to disk on every message → a local process floods `audit-chain.jsonl` (disk exhaustion + buries real events). Fix: rate-limit/coalesce before sealing unauthenticated denials; cap+rotate the file.

### C. Authentication rate-limiting & 2FA (go-api)

- **AUD-AUTH-02 (High, confirmed):** `ClientIP()` returns the leftmost `X-Forwarded-For` verbatim with no trusted-proxy allowlist; both limiters + chi `RealIP` key on it. Rotating the header gives a fresh bucket per request → per-IP gate nullified. Fix: only honor XFF from a configured trusted-proxy CIDR; default to `RemoteAddr`.
- **AUD-AUTH-01 (Medium, ↓ from High):** TOTP verify has no per-email cap, no consumed-code tracking, and pending SRP-verified state survives failed attempts → brute-force of the 3-valid-codes/30s window. Verifier downgraded to Medium because it **presupposes the attacker already holds the master password** (it is a 2FA-bypass / defense-in-depth failure, not primary credential compromise). Fix: per-pending failure counter + delete-on-N-failures + consumed-code store + apply the per-email limiter to the TOTP route.

### D. Cryptographic integrity binding (crypto-ts)

- **AUD-CRYPTO-01 (Medium, high confidence):** vault items are AES-GCM-encrypted with **no AAD binding** to item id/type/vault/revision; all that metadata is server-supplied plaintext trusted verbatim. A compromised/malicious server (the exact zero-knowledge adversary) can swap a blob across slots or replay an old blob under a higher fabricated revision — the tag still verifies, the client renders attacker-chosen plaintext under attacker-chosen identity (credential rollback / wrong-site label). Fix: bind item id (+type/vaultId) via GCM `additionalData`; add a signed/MAC'd revision manifest for rollback resistance.
- **AUD-CRYPTO-02 (Medium):** the SRP verifier is derived from `H(salt‖H(email:password))` — pure SHA-256, **bypassing** the Argon2id hardening that protects the enc/auth/mac path. A leaked verifier (compromised-server scenario) is brute-forceable at ~2 SHA-256 + 1 modexp per guess. The code comment even claims "from auth key" — make the implementation match by feeding the Argon2-derived authKey into the verifier.

### E. Client XSS blast radius (web-extension)

- **AUD-EXT-05 (Medium):** the web client (static `output:'export'`) ships **no CSP**; the decrypted vaultKey + session token live in JS memory → any XSS (incl. dependency supply-chain) collapses zero-knowledge. Fix: strict CSP at the edge/CDN + SRI + dependency-audit gate.
- **AUD-EXT-06 (Medium):** session token persisted in `sessionStorage` (XSS-readable), contradicting the layout's own "no sessionStorage" comment. Fix: memory-only or httpOnly+Secure+SameSite cookie.
- **AUD-EXT-07 (Medium):** the MCP gateway `WebSocketServer({port})` binds `0.0.0.0` with no Origin check on upgrade — LAN-reachable credential broker. Fix: bind `127.0.0.1` + Origin allowlist (mirror the macOS SEC-006 loopback posture).

### F. Key hygiene & generator correctness (macos + crypto-ts)

- **AUD-SE-VAULT-01 (Low):** `provisionAndUnlock` zeroes `seed` but leaves `syncKey`/`authKey`/`agentRootKey` + the source `vaultKey` copy un-zeroed (`SeedKeyBundle` uses immutable `let` Data). Memory-read attacker recovers sibling HD keys. Fix: zeroizing bundle API; derive only what's needed at unlock.
- **AUD-CRYPTO-03 (Low):** `derivePassword` silently truncates any requested length > 128. Fix: counter-mode expansion.
- **AUD-POLICY-02 (Low):** per-policy `approvalTimeoutSeconds` is silently ignored; all step-ups use the hardcoded 60s. Fix: thread the configured timeout through.
- **AUD-POLICY-01 (Medium, latent):** step-up approval short-circuits the policy loop, leaving lower-priority `item_scope`/`rate_limit`/`time_window` policies unenforced after the user approves. Not default-exploitable (default config orders step-up below action-perm), but `priority` is a free unvalidated `Int` over a sync/import path. Fix: make step-up a deferred *gate* after all other policies pass.
- **AUD-CRYPTO-04 (Info):** `derivePassword` uses biased modulo while the comment claims "rejection sampling" (entropy loss ~0.01 bit/20-char — negligible; fix the comment or implement rejection sampling).

---

## Refuted findings (verifier overturned — transparency)

The web-extension auditor reported 4 Critical/High issues premised on "a malicious web page can reach the background message router." The independent verifier **refuted all four** at `c2a72ce`:

| ID | Claimed | Why refuted | Residual |
|---|---|---|---|
| AUD-EXT-01 | Any page drives privileged handlers (no sender check) | No `externally_connectable`; content script runs in isolated world; no page→content-script relay. The missing `sender` check is real but unreachable. | Low (defense-in-depth) |
| AUD-EXT-02 | AUTOFILL_REQUEST cross-origin password theft | `AUTOFILL_REQUEST`/`SEARCH_ITEMS` sent only by the popup; content script only emits `FORM_DETECTED`; no transport for a page-chosen itemId. | none |
| AUD-EXT-03 | SEARCH_ITEMS leaks all login metadata to any page | Same transport block; `search('',undefined)` returning all is a footgun but not page-reachable. | Info |
| AUD-EXT-04 | UNLOCK_VAULT remote brute-force oracle | `runtime.onMessage` only receives extension-context senders; no relay → no remote oracle. Missing throttle is still worth adding. | Low |

The literal code observations (missing sender validation, no autofill origin-binding, no unlock throttle) are valid **hardening** items — fold them in if `externally_connectable` or a page-message relay is ever added. They are not current exploits.

---

## Decisions / Next Actions (prioritized fix queue)

> Source is **not** mutated by this audit. Coordinate with the concurrent session active on this repo before editing source (a second agent committed `30db413`/`c2a72ce` during the prior session).

| # | Priority | Finding(s) | Action | Owner | Gate |
|---|---|---|---|---|---|
| 1 | **Release-blocker** | AUD-SSRF-01, -02, -03 | Domain allowlist for health-check destinations + IP-normalized reserved-range reject + redirect/header-strip delegate | macOS | new SSRF test matrix (the 7 bypass encodings) all BLOCK |
| 2 | High | AUD-AUTH-02 | Trusted-proxy CIDR allowlist for XFF; default RemoteAddr | go-api | XFF-rotation test no longer resets bucket |
| 3 | High | BROKER-AUDIT-01 | Keychain-anchored `(seq, head-hash)`; reject empty/prefix on load | macOS | truncation + deletion test → `loadedIntegrityOK=false` |
| 4 | Medium | AUD-CRYPTO-01 | GCM AAD bind item id/type/vaultId + signed revision manifest | crypto-ts | swap/rollback test fails GCM tag |
| 5 | Medium | AUD-AUTH-01, API-AUDIT-01, AUD-DOS-01 | TOTP failure-counter + consumed-code; wire `LogEvent`+HMAC chain; pre-auth audit rate-limit | go-api + macOS | per-account TOTP lockout test; audit rows written |
| 6 | Medium | AUD-CRYPTO-02, AUD-EXT-05/06/07, AUD-POLICY-01 | Argon2-derived SRP verifier; CSP+token hygiene; WS loopback+Origin; step-up as deferred gate | crypto-ts + web + macOS | per-item tests |
| 7 | Low/Info | AUD-SE-VAULT-01, CRYPTO-03/04, POLICY-02 | Zeroizing bundle; counter-mode expansion; thread timeout; fix comment | mixed | unit tests |

**Distribution gate recommendation:** ship distribution only after #1 (Critical) is fixed and re-tested. #2/#3 should land in the same release. #4–#7 can be a fast-follow.

---

## Audited-clean highlights (residual-risk scoping)

Solid as committed (`c2a72ce`): CSPRNG everywhere (`crypto.getRandomValues`); AES-256-GCM fresh 12-byte nonce per encryption, no reuse path; HD domain separation (hardened HMAC-SHA512); Argon2id 256 MB/3 iters with fresh 32-byte salt; SRP-6a RFC 5054 Group 14 with constant-time M2 compare; Secure Enclave `.biometryCurrentSet` + `WhenUnlockedThisDeviceOnly` (anti-coercion); `noteActivity()` reachable only from human UI (broker traffic cannot re-arm auto-lock — SEC-009 verified intact); broker bearer-token constant-time + hash-only (SEC-001); loopback IP-literal enforcement (SEC-006); deny-by-default policy engine; full server-side IDOR scoping (`AND user_id=$N` on every query); pgx parameterization (no SQLi); zero-knowledge invariant holds server-side (only encrypted blobs stored/returned/logged); MCP proxy SSRF defense (`proxy-security.ts`) is the *correct* pattern the macOS guard should adopt.

---

Auth Box v0.1.0 — Pre-Release Security Audit
Maurice | maurice_wen@proton.me
2026-06-02 · source: read-only adversarial audit @ commit c2a72ce, 6 surfaces, 15 agents
