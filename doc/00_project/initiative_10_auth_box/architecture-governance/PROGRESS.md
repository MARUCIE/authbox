# Entropy-reduction progress

Branch `claude/project-thread-vanndq`, stacked on PR #3 (`claude/ultrareview-authbox-oavv0o`).
One commit per batch. Every batch migrates all callers, deletes the replaced code, and is verified
before commit. Baseline and evidence: `ARCHITECTURE_MAP.md` §5.

| Batch | Commit | Change | Verification |
| --- | --- | --- | --- |
| 1 | c936756 | pnpm lockfile resynced (frozen install works); real catalog tests for @authbox/shared; turbo test outputs fixed | `pnpm install --frozen-lockfile`; shared 6 tests |
| 2 | 29ad87f | Deleted stale compiled files in shared/src, the unused zod validation module, unused deps (zod ×2, cva, lucide-react, @scure/base) and dead exports | package + app builds and tests |
| 3a | e4f2189 | Relative imports in packages carry `.js` so dist loads under plain Node ESM; tsbuildinfo lives in dist so a clean rebuild is complete | `node -e "import('@authbox/crypto')"`; `rm -rf dist && tsc` |
| 3 | (this) | One chunk-safe byte codec in @authbox/crypto (ADR-004); 7 copies removed; apps resolve workspace packages only through `exports`/dist | crypto 130 tests (new codec suite incl. 2 MB round-trip and Buffer agreement); web `next build`; extension `vite build`; app tests; e2e 73/73 |

Wallet e2e stays 12/14 throughout: the 2 failures are the public block indexer returning 502 from the sandbox.
