# Frontend/Backend Entrypoint Consistency Report

- Run: 20260211T135931Z
- Generated At (UTC): 2026-02-11T14:04:07Z

## Scope
- Frontend route map
- Backend API route registration
- Runtime entrypoints (README / docker-compose / Makefile)
- API error/response contract alignment

## Findings (Before -> After)
- README health endpoint mismatch (`8081`) -> fixed to `4010` to match compose port mapping.
- Makefile service names (`web`/`db`) mismatched compose (`console`/`postgres`) -> fixed CLI targets.
- API docs listed credentials/assistants/audit as if implemented -> backend now registers explicit routes with standardized `501 NOT_IMPLEMENTED`.
- API error code set lacked `NOT_IMPLEMENTED` -> added to contract table.
- Health response example omitted `env` and `time` -> synced with handler output.
- Architecture API surface lacked runtime status -> updated to implemented vs planned(501) split.

## Current Route Surface
- Console pages: `/platforms`, `/accounts`, `/credentials`, `/assistants`, `/audit`, `/settings` (+ detail/new subpaths).
- API implemented: `/health`, `/api/v1/platforms/*`, `/api/v1/accounts/*`.
- API planned placeholders: `/api/v1/credentials/*`, `/api/v1/assistants/*`, `/api/v1/audit/*` (501).

## Evidence
- outputs/fe-be-entry-consistency/20260211T135931Z/reports/frontend_scan.txt
- outputs/fe-be-entry-consistency/20260211T135931Z/reports/backend_scan.txt
- outputs/fe-be-entry-consistency/20260211T135931Z/reports/entrypoints_scan.txt
- outputs/fe-be-entry-consistency/20260211T135931Z/reports/contract_scan.txt
- outputs/fe-be-entry-consistency/20260211T135931Z/diff/current.patch
