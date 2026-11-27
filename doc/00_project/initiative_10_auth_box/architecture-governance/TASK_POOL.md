# Entropy-reduction task pool

Status: `todo`, `doing`, `done (batch N)`, `pending-decision` (needs the owner; not changed by the loop).
Selection rule: highest value per unit of risk first; every batch migrates all callers and deletes
the replaced code before it is committed.

| ID | Item | Value | Risk | Status |
| --- | --- | --- | --- | --- |
| T-01 | Sync pnpm lockfile with manifests so `--frozen-lockfile` installs | high | low | done (batch 1) |
| T-02 | Make `pnpm test` meaningful for @authbox/shared (real tests, not an always-failing script) | med | low | done (batch 1) |
| T-03 | Delete stale compiled artifacts in packages/shared/src (D-06) | med | low | done (batch 2) |
| T-04 | Delete unused zod validation module and its dependency (D-09); drop other unused dependencies and dead exports | med | low | done (batch 2) |
| T-05 | One base64 / hex codec in @authbox/crypto, chunk-safe; migrate every copy (D-01, D-02) | high | low | done (batch 3) |
| T-06 | Go: one HTTP response package (envelope, codes, content type) used by handler, auth middleware, rate limiter, security middleware (D-07) | high | low | done (batch 4) |
| T-07 | Go: one request-boundary helper set (authenticated user, id params, body decode) | high | low | done (batch 4) |
| T-08 | Go: one service-error → HTTP mapping; not-found always a sentinel error, never `nil, nil` | high | med | done (batch 4) |
| T-09 | Extension uses the same typed API client and pagination as web (D-04, D-05) | high | med | done (batch 5) |
| T-10 | Executable architecture rules: Go layer-direction test; TS boundary check (no app→app, no package→app imports, no build output in src, no local codec copies) | high | low | done (batch 6) |
| T-11 | CI workflow that builds, typechecks and tests every workspace + Go + architecture rules on every PR | high | low | done (batch 6) |
| P-01 | Move the SRP verifier to a memory-hard KDF (needs every client to migrate) | high | high | pending-decision (owner) |
| P-02 | apps/console has two lockfiles (D-08); release gate uses npm. Switch the gate to pnpm and drop package-lock.json? | med | med | pending-decision |
| P-03 | apps/console `platforms` pages call `/api/v1/platforms`, which no backend in this repo serves, with a default bearer token `local-admin-token`. Delete the feature or point it at a real API? | med | med | pending-decision (product) |
| P-04 | `outputs/` holds ~1400 committed run artefacts (evidence logs). Move out of the repo? | low | low | pending-decision (data) |
| P-05 | Web and extension UI share no design tokens or components. Unifying them is a visual change and needs the design lanes | med | high | pending-decision (design) |
| P-06 | apps/web pins next ^15.2.0 (resolves 15.5.12), console ^15.5.29. Align versions? | low | med | pending-decision |
| P-07 | A whole legacy harness targets the retired `internal/server` API (`/api/v1/platforms`, `/accounts`, `/credentials`, `/assistants`): scripts/full_loop_closure_check.sh (incl. `go test ./internal/server -run TestContractLoop`, package gone), services/api/scripts/{real_api_core_flow,replay_real_api_fixtures}.sh, 37 recorded JSON fixtures under services/api/testdata/fixtures, and `make full-loop-check`. It cannot pass against the current API. Delete it? (JSON fixtures are data files, so the repo rule requires the owner's explicit yes) | med | low | pending-decision (data) |
