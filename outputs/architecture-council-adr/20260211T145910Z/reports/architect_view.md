# Architect View

## System Boundary
- In-scope:
  - Console UX + API orchestration (`apps/console`, `services/api`)
  - Account, credential, assistant binding, audit export workflows
  - Runtime dependencies: PostgreSQL, Redis, external provider APIs
- Out-of-scope:
  - External provider IAM internals
  - Long-term audit archive service implementation details

## Layered Architecture (Current)
- L1 Presentation:
  - Next.js route pages (`apps/console/app/**`)
- L2 API Delivery:
  - Chi router + middleware + handlers (`services/api/internal/server`, `services/api/internal/handlers`)
- L3 Domain Model:
  - Entity + request validation (`services/api/internal/models`)
- L4 Data Access:
  - Repository abstraction (current in-memory impl, future DB-backed)
- L5 Platform Infra:
  - PostgreSQL/Redis/Container runtime

## Council Decision (Architect)
1. Keep a modular monolith boundary for MVP, but enforce domain seams (Platform/Account/Credential/Assistant/Audit).
2. Move repositories to interface-driven contracts in MVP-2 to decouple from in-memory implementations.
3. Preserve API contract-first flow: docs and routes must change together in one run.

## Immediate Refactoring Priorities
- Introduce repository interfaces and dependency inversion at handler layer.
- Add request/response schema package to reduce duplicated validation logic.
- Add versioned ADR index and architecture changelog linkage.
