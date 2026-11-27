# Entropy-reduction progress

Branch `claude/project-thread-vanndq`, stacked on PR #3 (`claude/ultrareview-authbox-oavv0o`).
One commit per batch. Every batch migrates all callers, deletes the replaced code, and is verified
before commit. Baseline and evidence: `ARCHITECTURE_MAP.md` §5.

| Batch | Commit | Change | Verification |
| --- | --- | --- | --- |
| 1 | c936756 | pnpm lockfile resynced (frozen install works); real catalog tests for @authbox/shared; turbo test outputs fixed | `pnpm install --frozen-lockfile`; shared 6 tests |
| 2 | 29ad87f | Deleted stale compiled files in shared/src, the unused zod validation module, unused deps (zod ×2, cva, lucide-react, @scure/base) and dead exports | package + app builds and tests |
| 3a | e4f2189 | Relative imports in packages carry `.js` so dist loads under plain Node ESM; tsbuildinfo lives in dist so a clean rebuild is complete | `node -e "import('@authbox/crypto')"`; `rm -rf dist && tsc` |
| 3 | b225d55 | One chunk-safe byte codec in @authbox/crypto (ADR-004); 7 copies removed; apps resolve workspace packages only through `exports`/dist | crypto 130 tests (new codec suite incl. 2 MB round-trip and Buffer agreement); web `next build`; extension `vite build`; app tests; e2e 73/73 |
| 4 | 23a4a64 | Go API boundary: `internal/httpx` owns the response envelope, content type and error codes for handlers, auth middleware, rate limiter and security middleware; handler request helpers (`requireUser`, `uuidParam`, `decodeJSON`, `writeInternal`) replace 43 + 19 + 18 + 36 hand-copied blocks; service `Get*` return not-found sentinels; one error mapper per domain (agent, connection, vault) | `go vet`, `go test ./...` (new: httpx envelope bytes, auth 401 JSON, 415 JSON, GetItem sentinel); e2e 73/73 |
| 5 | (this) | New package `@authbox/api-client` (ADR-006): the typed client moved out of apps/web; `collectPages`; the SRP login handshake (`srpLogin`, server-proof check included) under `@authbox/api-client/login`. web and extension both instantiate it with their own base-URL policy; the extension's three raw-fetch login calls, raw vault fetches and its own pagination loop are gone. Fixed on the way: the extension read `item.revision`, which the API never sends (it sends `version`), so every cached item had `revision: undefined`. Deleted the parallel, unused wire-type model in @authbox/shared (`types/auth.ts`, `types/audit.ts`, `types/wallet.ts`, `EncryptedVaultItem`, `Vault`) and the now-unused `@authbox/crypto/encoding` subpath | api-client tests incl. a live-API test (register, srpLogin, M2 check, vault key decrypt, wrong password → 401); web `next build`; extension `vite build` (login code still lazy-loaded; popup crypto chunk 228 KB → 94 KB); app and package tests; e2e 73/73 |

Wallet e2e stays 12/14 throughout: the 2 failures are the public block indexer returning 502 from the sandbox.
