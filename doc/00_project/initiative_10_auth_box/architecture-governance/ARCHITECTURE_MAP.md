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
| Wire error envelope `{error, code}` | handler/response.go | Re-implemented by hand-written JSON strings in auth/middleware.go, middleware/ratelimit.go, middleware/security.go (text/plain content type) |
| Bad-request / not-found / conflict mapping | 3 per-handler helpers + ~150 inline branches | `writeAgentError`, `writeConnectionError`, `writeTOTPError`; not-found signalled two ways (nil result vs sentinel error) |
| Authenticated user id | auth.UserIDFromContext | 43 copies of the same 4-line guard, with 3 different messages |
| URL id parsing | handler | 19 copies of `uuid.Parse(chi.URLParam(...))` |
| Body decoding | handler | 18 copies of `json.NewDecoder(r.Body).Decode` |
| Error codes | string literals | `INTERNAL` and `INTERNAL_ERROR` both used for 500 |

## 3. TypeScript package graph

| Package | Depends on | Consumers |
| --- | --- | --- |
| @authbox/crypto | @noble/*, @scure/* | web, extension, scripts/e2e |
| @authbox/shared | zod (only for an unused module) | web (3 imports), extension (2), mcp-protocol (3) |
| @authbox/mcp-protocol | shared | none inside the repo (published surface) |

## 4. Duplicate / parallel implementations found

| ID | Concept | Copies | Where |
| --- | --- | --- | --- |
| D-01 | base64 bytes⇄string | 4 + 2 | web/lib/auth.ts, web/lib/vault-service.ts, web/app/(vault)/authorizations/page.tsx, extension/src/popup/App.tsx, extension/src/lib/vault-cache.ts. All use `String.fromCharCode(...bytes)`, which throws `RangeError` once a blob passes the engine's argument limit (~125 KB) |
| D-02 | bytes→hex | 2 | crypto/src/wallet.ts, crypto/src/arweave-vault.ts |
| D-03 | API base URL resolution | 3 | web/lib/api.ts, extension/src/lib/config.ts, console/lib/api.ts (different env names per runtime, intended) |
| D-04 | HTTP client for the Go API | 2 | web/lib/api.ts (typed, error class) vs raw `fetch` in extension popup + vault-cache |
| D-05 | Paginated item loading | 2 | web/lib/paginate.ts vs hand loop in extension/src/lib/vault-cache.ts |
| D-06 | Compiled artifacts next to sources | 1 set | packages/shared/src/**/*.{js,d.ts,js.map}, stale (no wallet or credential-catalog output) |
| D-07 | JSON error writer | 4 | see §2 |
| D-08 | Lockfiles for apps/console | 2 | pnpm-lock.yaml (workspace) and apps/console/package-lock.json (used by the release gate) |
| D-09 | Wire validation schemas | 1 unused | packages/shared/src/validation (zod, 344 lines, zero importers); the Go API is the validator of record |

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
