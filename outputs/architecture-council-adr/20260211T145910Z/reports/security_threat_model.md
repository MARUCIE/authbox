# Security Lead View (Threat Model)

## Threat Modeling Scope
- Components: API router, handlers, repositories, Docker runtime, console-to-API call path.
- Method: STRIDE + operational hardening controls.

## Priority Threats
| ID | STRIDE | Threat | Current Risk | Mitigation Decision |
|---|---|---|---|---|
| SEC-01 | Spoofing | API endpoints lack authn/authz gates | High | Add JWT/API key auth middleware + RBAC checks before business handlers |
| SEC-02 | Tampering | In-memory state has no integrity/audit chain protections | High | Move audit trail to append-only DB table with hash-chain metadata |
| SEC-03 | Repudiation | Request actor identity not persisted in all audit events | High | Require actor_id/source in all mutating operations |
| SEC-04 | Info Disclosure | Dev DSN and weak secret handling in compose defaults | Medium | Secret injection via env file/secret manager; remove static dev creds for shared env |
| SEC-05 | DoS | No rate limit/circuit breaker for provider-facing operations | Medium | Add per-route rate limit and upstream timeout/retry budget |
| SEC-06 | Elevation | No scope-based policy enforcement for assistant bind/use | High | Add policy engine guardrails for credential scope + assistant actions |

## Security ADR Inputs
- Security gate must shift left into middleware stack, not post-facto in handlers.
- Audit events are security artifacts; they need immutability and actor provenance.
