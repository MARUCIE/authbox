# Architecture Council Consensus

## Participants
- Architect
- Security Lead
- SRE Lead

## Consensus Decisions
1. **Boundary & Layering**: Keep modular monolith for current stage; formalize domain seams and repository interfaces.
2. **Security Baseline**: Introduce authn/authz middleware, immutable audit trail, and policy checks for assistant/credential operations.
3. **Reliability Baseline**: Define MVP-1 SLOs and implement observability primitives (metrics, traces, structured logs, alerts).
4. **Execution Artifacts**: Publish ADR and risk register, and link both from `SYSTEM_ARCHITECTURE.md`.

## Deliverables
- ADR: `doc/00_project/initiative_10_auth_box/ARCHITECTURE_ADR.md`
- Risk register: `doc/00_project/initiative_10_auth_box/ARCHITECTURE_RISK_REGISTER.md`
