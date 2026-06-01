---
Title: Auth Box for Mac — Native macOS App Architecture
Scope: feature
Owner: ai-agent
Status: active
LastUpdated: 2026-06-01
Related:
  - /doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md
  - /doc/00_project/initiative_10_auth_box/PRD.md
  - /apps/ios/AuthBoxCrypto/Package.swift
  - /packages/shared/src/types/credential-catalog.ts
  - /postmortem/PM-20260531-002-mcp-policy-fail-open.md
---

# Auth Box for Mac — Native macOS App Architecture

> A native SwiftUI macOS app that fuses three domains into one Touch-ID-gated
> local broker: **(1) password vault**, **(2) AI provider credential hub (70+
> providers)**, and **(3) authorization / agent-delegation management**. It
> extends the existing `authbox` v5 "Unstoppable" architecture; it does not
> replace its zero-knowledge / seed-phrase core.

This document is the canonical (machine-readable, English) half of a 2-file pair.
The human-facing Chinese companion is `ARCHITECTURE.html` (routed through
`html-style-router`).

---

## 1. Why this exists (problem statement)

Three credential surfaces are currently fragmented and partly insecure:

1. **Passwords** live in the Auth Box vault (web/iOS), but there is no first-class
   *Mac-native* client — Layer 3 only pencilled in a Tauri desktop.
2. **AI provider keys** (OpenAI, Anthropic, AWS, …) are managed in the web hub,
   but on the developer's Mac they leak into git-tracked config files. A
   2026-06-01 fleet audit (`00-AI-Fleet`) found real provider keys committed to
   `gemini-api-config.json`, pm2 env dumps, and a probe script — exactly the
   failure mode a local Keychain broker eliminates.
3. **Agent authorization** (which AI agent may use which credential, under what
   policy) is enforced by the MCP Gateway policy engine, but step-up auth has no
   strong local factor — there is no hardware-backed human-in-the-loop gate.

The Mac is the one device that already has the right primitives: **Touch ID
(LocalAuthentication), the Keychain, and the Secure Enclave**. A native macOS app
unifies the three surfaces behind one hardware-gated broker.

---

## 2. Architecture Decision Record (ADR)

### ADR-001 — Native SwiftUI macOS, not Tauri, not Mac Catalyst

**Decision:** Build a dedicated **multiplatform SwiftUI target `apps/macos`** that
shares the existing `AuthBoxCrypto` SwiftPM package and the domain layer with
`apps/ios`, but ships a **Mac-native UI** (main window + menu-bar extra).

**Context / forces:**
- `AuthBoxCrypto/Package.swift` already declares `platforms: [.iOS(.v17), .macOS(.v14)]`.
  The crypto core (Argon2id, SRP-6a, HKDF, AES-GCM, BIP-39 HD derivation) is
  already cross-platform Swift. **Reuse cost ≈ 0.**
- A password manager is a security product: the marginal attack surface of a web
  runtime (Tauri/Electron) is unacceptable when the native alternative gives
  first-class Secure Enclave key-wrapping, Keychain ACLs, App Sandbox, and Touch ID.
- Mac Catalyst would produce a phone-shaped app; wrong UX for a menu-bar
  credential broker that must feel like 1Password/Keychain Access, not an iPad app.

**Consequences:**
- Replaces `DESK[Desktop App - Tauri]` in `SYSTEM_ARCHITECTURE.md` Layer 3 with
  `MAC[Native macOS App - SwiftUI]`.
- One more Xcode target to maintain, but it shares ≥80% of its code with iOS
  (crypto package + domain + most of Features/*). Net maintenance < a parallel
  Tauri codebase.

**Rejected alternatives:** Tauri desktop (web attack surface), Mac Catalyst (wrong
UX), new crypto implementation (violates reuse, re-introduces cross-impl drift the
`ios:crypto-vectors` test exists to prevent).

### ADR-002 — Touch ID is the backend for the existing `step_up` policy

**Decision:** Do **not** invent a new auth concept. The MCP policy engine already
defines `step_up` as a canonical policy type (PM-20260531-002). The macOS app
implements `step_up` by calling `LAContext.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics)`.
Touch ID is a *backend for an existing extension point*, not a new surface.

### ADR-003 — Deny-by-default everywhere (bake in the PM-002 lesson)

**Decision:** The local broker's policy evaluation is fail-closed: unknown policy
type → deny; required scoped attribute missing → deny; biometric unavailable and
policy requires `step_up` → deny (never silently downgrade). Mirrors the Go/TS
fix in PM-20260531-002 so the three engines (TS MCP, Go API, Swift broker) stay
contract-aligned.

### ADR-004 — Secrets only in Keychain + Secure Enclave; never in a file the app ships or git tracks

**Decision:** Plaintext credentials and the vault encryption key never touch disk
unencrypted and never enter the app bundle or git. The vault key is wrapped by a
Secure-Enclave-resident key released only after Touch ID. This is the structural
fix for the AI-Fleet leak class.

---

## 3. Module map

```
apps/
  ios/
    AuthBoxCrypto/            # SHARED SwiftPM — already iOS+macOS (no change)
    AuthBox/Sources/
      App/ Core/ Design/ Features/{Vault,Generator,Onboarding,Settings}
  macos/                      # NEW target
    AuthBoxMac/
      App/                    # @main App, menu-bar scene, window scene
      Core/
        Auth/                 # LocalAuthentication (Touch ID), LAContext lifecycle
        Keychain/             # Keychain Services + Secure Enclave key wrap
        Broker/               # local MCP Gateway host (ws://127.0.0.1:19876)
        Policy/               # Swift port of the 五原语 deny-by-default engine
        Storage/              # SwiftData local store (encrypted blobs only)
        Network/              # optional Go-API sync client (reused contract)
      Domain/                 # SHARED with iOS via SwiftPM or file refs:
        Vault/                #   vault model, seed-phrase HD derivation
        Providers/            #   CredentialCatalog (Swift port of credential-catalog.ts)
        Delegation/           #   agent / capability / policy / effect / fact (五原语)
      Features/
        Vault/                # password list, item detail, generator
        ProviderHub/          # 70+ providers, .env drag-drop import, health checks
        Authorizations/       # agent grants, policy editor, audit log, live consent
        MenuBar/              # quick-unlock, pending agent requests, lock-all
        Settings/
      AuthBoxMac.entitlements # app-group group.com.authbox.shared, keychain-access-groups,
                              # app-sandbox, hardened-runtime
packages/
  shared/src/types/credential-catalog.ts   # SOURCE OF TRUTH for provider catalog
                                            # → codegen Swift mirror (see §6)
```

Code reuse target: **≥80%** of non-UI logic shared with `apps/ios`.

---

## 4. The three fused domains

### 4.1 Password Vault
- Reuses `AuthBoxCrypto`: seed phrase (BIP-39, 24 words) → master key (Argon2id) →
  vault key (HKDF) → AES-GCM item encryption. Deterministic password derivation
  (`seed + site → password`) for the "empty vault" mode.
- Local store: SwiftData holding only ciphertext blobs + metadata. The vault key
  lives in memory only while unlocked; wrapped at rest by the Secure Enclave key.
- Optional sync via the existing Go API (SRP-6a auth, zero-knowledge blobs). Sync
  is Layer-2 optional; the app is fully functional offline.

### 4.2 AI Provider Hub
- `CredentialCatalog` (Swift) is generated from `packages/shared/src/types/credential-catalog.ts`
  (single source of truth, 70+ providers / 15 categories). Generation, not hand-copy,
  prevents catalog drift.
- **.env drag-drop import**: parse dropped `.env` files, classify each var to a
  provider via `EnvPattern`, preview, then store each secret as a vault item tagged
  with `categoryId`/`providerId`.
- **Credential health checks**: per-provider liveness probe (port of
  `apps/web/lib/credential-health.ts`) — one-click "are these keys still valid".
- Each provider key is a first-class vault item, so it inherits encryption, sync,
  and (critically) delegation policy.

### 4.3 Authorization / Agent Delegation Broker
- Hosts the **local MCP Gateway** on `ws://127.0.0.1:19876` (loopback only).
- An AI agent (Claude, GPT, a CLI proxy) connects and requests a credential by
  `itemId` (service name) + `action`. The Swift policy engine evaluates the
  五原语 model:
  - **Capability**: what the agent is allowed to request
  - **Intent**: the specific request (item + action + context)
  - **Policy**: `item_scope | action_perm | rate_limit | time_window | step_up`
  - **Effect**: the gated release (or denial)
  - **Fact**: the immutable audit record
- `step_up` → a macOS Touch ID prompt (and/or a menu-bar consent card showing
  "Claude wants the OpenAI key for action `proxy.chat` — Allow once / Deny").
- Deny-by-default (ADR-003). Every decision is appended to a local, tamper-evident
  audit log (Fact).
- **This is the AI-Fleet fix**: instead of `gemini-proxy` reading keys from a
  git-tracked `gemini-api-config.json`, it requests them from the broker, which
  releases them per-policy after Touch ID and logs the access.

---

## 5. macOS auth & key architecture

```
Touch ID (LocalAuthentication)
   │  evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics)
   ▼
Secure Enclave key (kSecAttrTokenIDSecureEnclave, access control:
   .biometryCurrentSet + .privateKeyUsage)
   │  unwraps
   ▼
Vault Master Key (in-memory only while unlocked; zeroed on lock/sleep)
   │  HKDF
   ▼
per-item AES-GCM keys ─── decrypt ──▶ plaintext credential (released per policy)
```

- **Keychain Services** stores the Secure-Enclave-wrapped vault key with an access
  control requiring `biometryCurrentSet` — re-enrolling a fingerprint invalidates
  it (anti-coercion).
- **Auto-lock**: lock on sleep, on screensaver, and after configurable idle; wipe
  the in-memory master key.
- **App Sandbox + Hardened Runtime + notarization**: required for a credential
  broker; constrains blast radius if the process is compromised.
- **keychain-access-groups + app-group `group.com.authbox.shared`**: lets the
  (future) macOS AutoFill credential-provider extension share the vault, mirroring
  the iOS entitlements already present.

---

## 6. Catalog codegen (anti-drift)

`credential-catalog.ts` is the **single source of truth**. A build step emits
`apps/macos/AuthBoxMac/Domain/Providers/CredentialCatalog.generated.swift`:

- Rebuild command: `pnpm run gen:swift-catalog` (new script, wraps a tsx codegen).
- Owner/reconciler: the web/shared package owner.
- Freshness rule: CI fails if the generated Swift is out of sync with the TS source
  (checksum compare), per the System-of-Record / Derived-Cache contract.

This keeps the 70+ provider definitions in one place; Swift consumes a derived
mirror, never a hand-maintained fork.

---

## 7. Threat model (attacker review summary)

| Threat | Mitigation |
|---|---|
| Malware reads vault on disk | At rest the vault key is Secure-Enclave-wrapped; only ciphertext blobs persist |
| Process memory scrape | Master key in memory only while unlocked; zeroed on lock/sleep; sandboxed |
| Malicious AI agent over MCP | Loopback-only bind; deny-by-default policy; `step_up` Touch ID; per-request audit |
| Policy enum drift / fail-open | Swift engine contract-tested against TS+Go; unknown type → deny (PM-002) |
| Key in bundle/git | Structurally impossible — secrets only in Keychain/Enclave, never in files the app ships |
| Coerced fingerprint re-enroll | `biometryCurrentSet` invalidates the wrapped key on enrollment change |
| Replay / over-broad grant | `rate_limit` + `time_window` + `item_scope` policies; "Allow once" default in consent UI |

A full `/security` attacker-review SubAgent pass is a release gate (see §9).

---

## 8. Code reuse matrix

| Layer | Source | macOS reuse |
|---|---|---|
| Crypto (Argon2id/SRP/HKDF/AES-GCM/BIP-39) | `AuthBoxCrypto` SwiftPM | 100% (already macOS 14) |
| Vault domain model | `apps/ios` Domain | shared via SwiftPM/file refs |
| Provider catalog | `credential-catalog.ts` | codegen → Swift (§6) |
| Provider health checks | `apps/web/lib/credential-health.ts` | port to Swift (logic, not UI) |
| .env parser | `apps/web/lib/env-import-parser.ts` | port to Swift |
| MCP policy engine (五原语) | `packages/mcp-protocol` | port to Swift, contract-tested vs TS |
| Sync client | `services/api` contract | reuse OpenAPI/SRP contract |
| UI | new | Mac-native SwiftUI (menu bar + window) |

---

## 9. Phased implementation plan (atomic)

The full atomic queue lives in `task_plan.md §WP-020`. Phase gates:

- **P0 — Scaffold**: `apps/macos` SwiftUI target in `AuthBox.xcodeproj`, link
  `AuthBoxCrypto`, App Sandbox + Hardened Runtime entitlements, build green on macOS 14.
- **P1 — Auth core**: LocalAuthentication unlock, Secure-Enclave-wrapped vault key,
  Keychain store, auto-lock. Verify: lock/unlock cycle, key zeroed on lock.
- **P2 — Vault**: item CRUD, generator, deterministic derivation, SwiftData store.
  Reuse iOS Features/Vault where possible.
- **P3 — Provider Hub**: catalog codegen, .env drag-drop import, health checks.
- **P4 — Authorization broker**: local MCP Gateway host, Swift policy engine
  (deny-by-default), `step_up` Touch ID, consent UI, audit log.
- **P5 — Distribution**: code sign + notarize, DMG, optional Sparkle updates.
- **P6 — AI-Fleet integration (bonus)**: a broker client so `gemini-proxy` et al.
  request keys from the broker instead of `gemini-api-config.json`.

Each phase: `pnpm typecheck && pnpm test` (TS sides) + `xcodebuild build/test`
(Swift), UX-map manual evidence in `notes.md`, then `/security` review before P5.

---

## 10. Verification plan

- **Crypto parity**: `pnpm run ios:crypto-vectors` must pass for macOS too
  (cross-platform vectors).
- **Policy contract**: Swift policy engine unit tests mirror
  `policy-engine.test.ts` fail-closed cases (unknown type, missing scoped attr).
- **Build**: `xcodebuild -scheme AuthBoxMac -destination 'platform=macOS' build test`.
- **Manual UX (Round 2)**: unlock with Touch ID → import a `.env` → an agent
  requests a key over MCP → Touch ID consent → audit entry appears. Evidence
  (screenshots) in `notes.md`.
- **Security gate**: `/security` attacker-review SubAgent before P5 distribution.

---
Maurice | maurice_wen@proton.me
2026-06-01 · Auth Box for Mac architecture · extends authbox v5 Unstoppable
