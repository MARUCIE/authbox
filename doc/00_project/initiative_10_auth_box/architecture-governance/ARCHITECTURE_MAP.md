# Auth Box architecture map (governance baseline)

Snapshot taken 2026-11-27 on top of draft PR #3 (`claude/ultrareview-authbox-oavv0o`, `95f1a60`).
This file is the map the entropy-reduction loop works from. It is updated at the end of every batch;
`PROGRESS.md` records what each batch changed and `TASK_POOL.md` holds what is left.

## 1. Runtime topology

```mermaid
flowchart LR
  subgraph Clients
    WEB[apps/web\nNext.js vault UI]
    EXT[apps/extension\nMV3 popup + service worker]
    IOS[apps/ios / apps/macos\nSwift, own crypto]
    CON[apps/console\nNext.js marketing + metrics]
  end
  subgraph Packages
    CRY[@authbox/crypto\nArgon2id, HKDF, AES-GCM, SRP, BIP-39/32, TOTP]
    SHR[@authbox/shared\nwire + domain types, credential catalog]
    MCP[@authbox/mcp-protocol\nMCP server, policy engine, proxy security]
  end
  API[services/api\nGo, chi, pgx] --> PG[(PostgreSQL)]
  WEB --> CRY & SHR
  EXT --> CRY & SHR
  MCP --> SHR
  WEB -->|HTTPS JSON| API
  EXT -->|HTTPS JSON| API
  IOS -->|HTTPS JSON| API
```

`apps/console` does not call `services/api`: its `lib/api.ts` targets `/api/v1/platforms`, which the Go API
does not serve (see TASK_POOL P-03).

## 2. Go API layering (services/api)

```
cmd/api ─┬─> config
         ├─> handler ──> service ──> domain <── repository/pg
         ├─> middleware        └──> auth (SRP math, session token hashing)
         └─> auth (session middleware)
```

Measured import edges (go list, 2026-11-27): handler→{auth, config, domain, middleware, service};
service→{auth, domain}; repository/pg→{domain}; domain→∅. No cycles. The direction is correct but
was not enforced by anything (task P-10).

Ownership:

| Concern | Owner | Notes |
| --- | --- | --- |
| Wire error envelope `{error, code}`, content type, error codes | internal/httpx | Since batch 4 the only writer; auth, rate-limit and security middleware use it (all errors are `application/json`) |
| Bad-request / not-found / conflict mapping | one mapper per domain in handler | `writeAgentError`, `writeConnectionError`, `writeVaultError`, `writeTOTPError`; every unexpected error goes through `writeInternal` (logged, generic 500, `INTERNAL_ERROR`) |
| Not-found | domain sentinels | Repositories return `nil, nil` for a missing row; services turn that into `domain.Err*NotFound` before it reaches a handler |
| Authenticated user id / URL ids / body decoding | handler/request.go | `requireUser`, `uuidParam`, `decodeJSON` |

## 3. TypeScript package graph

| Package | Depends on | Consumers |
| --- | --- | --- |
| @authbox/crypto | @noble/*, @scure/* | web, extension, api-client, scripts/e2e |
| @authbox/api-client | crypto (only under `./login`) | web, extension. Owns the Go API transport, error type, wire types and the SRP login handshake (since batch 5) |
| @authbox/shared | none | web, extension, mcp-protocol. Domain model only: decrypted vault items, agent policy, credential catalog (wire types live in api-client) |
| @authbox/mcp-protocol | shared | none inside the repo (published surface) |

## 4. Duplicate / parallel implementations found

| ID | Concept | Copies | Where |
| --- | --- | --- | --- |
| D-01 | base64 bytes⇄string (resolved, batch 3) | 4 + 2 | web/lib/auth.ts, web/lib/vault-service.ts, web/app/(vault)/authorizations/page.tsx, extension/src/popup/App.tsx, extension/src/lib/vault-cache.ts. All use `String.fromCharCode(...bytes)`, which throws `RangeError` once a blob passes the engine's argument limit (~125 KB) |
| D-02 | bytes→hex (resolved, batch 3) | 2 | crypto/src/wallet.ts, crypto/src/arweave-vault.ts |
| D-03 | API base URL resolution | 3 | web/lib/api.ts, extension/src/lib/config.ts, console/lib/api.ts (different env names per runtime, intended) |
| D-04 | HTTP client for the Go API (resolved, batch 5) | 2 | web/lib/api.ts (typed, error class) vs raw `fetch` in extension popup + vault-cache |
| D-05 | Paginated item loading (resolved, batch 5) | 2 | web/lib/paginate.ts vs hand loop in extension/src/lib/vault-cache.ts |
| D-06 | Compiled artifacts next to sources | 1 set | packages/shared/src/**/*.{js,d.ts,js.map}, stale (no wallet or credential-catalog output) |
| D-07 | JSON error writer | 4 | see §2 |
| D-08 | Lockfiles for apps/console | 2 | pnpm-lock.yaml (workspace) and apps/console/package-lock.json (used by the release gate) |
| D-09 | Wire validation schemas (resolved, batch 2) | 1 unused | packages/shared/src/validation (zod, 344 lines, zero importers); the Go API is the validator of record |
| D-10 | SRP login handshake (resolved, batch 5) | 2 | web/lib/auth.ts and extension popup each ran init → keys → M1 → M2 check |
| D-11 | Wire DTO types (resolved, batch 5) | 2 | inline in web/lib/api.ts vs an unused model in shared/types (auth, audit, wallet, EncryptedVaultItem); the shared one was wrong (`revision` instead of `version`) and the extension trusted it |

## 5. Toolchain truth

| Check | State at baseline |
| --- | --- |
| `pnpm install --frozen-lockfile` | fails: lockfile pins next 15.5.18, console manifest asks for ^15.5.29 |
| `pnpm test` (turbo) | fails: @authbox/shared has a `vitest run` script and no tests |
| CI | release-gate runs Go tests and the console npm build only; packages, web and extension are not built or tested in CI, and workflows only trigger for PRs into main |
| Go `go vet`, `go test ./...` | green |
| packages vitest | crypto 124 pass / 2 skip, mcp-protocol 13 pass |
| app node tests | web 5, extension 4, console 4 pass |
| Full-stack e2e (scripts/e2e-test.mjs, local Postgres) | 73/73 |
| wallet e2e | 12/14; the 2 failures are the public block indexer being unreachable from the sandbox (502), not code |
