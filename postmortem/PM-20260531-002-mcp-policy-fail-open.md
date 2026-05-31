---
Title: PM-20260531-002 MCP Policy Enum Drift And Fail Open
Status: fixed-critical
Owner: ai-agent
LastUpdated: 2026-05-31
Scope: mcp-policy
---

# Summary
The MCP policy engine allowed unknown policy types by default, while API and Web UI policy enum names had drifted away from MCP/shared policy semantics.

# Symptoms
- Unknown policy types such as `scope_access` were treated as allowed.
- API accepted legacy policy names not understood by the MCP engine.
- Item-scope policy evaluation could not enforce credential identity when request scope attributes were missing.

# Root Cause
- The MCP policy engine default branch failed open.
- API handler policy validation, Web UI defaults, and MCP policy engine types used inconsistent enum values.
- MCP credential and proxy tool requests passed only `agentId` and `action`, losing item identity before policy evaluation.

# Fix
- Unknown policy types now deny by default.
- API and Web UI policy types now align on canonical `item_scope`, `action_perm`, `rate_limit`, `time_window`, and `step_up`.
- Item-scope rules now deny when required request attributes are missing.
- MCP credential/proxy calls pass `itemId` as the requested service name.
- Added regression tests for fail-closed unknown policy types and missing scoped attributes.

# Prevention
- Policy enum changes must be contract-tested across shared types, API validation, Web defaults, and MCP enforcement.
- Any new policy type must have an explicit engine branch and a deny-by-default regression test.

# Triggers (machine-matchable)
TRIGGER_REGEX: default:\s*return\s*\{\s*allowed:\s*true
TRIGGER_REGEX: case\s+"(scope_access|step_up_auth|allowed_types)"
TRIGGER_REGEX: policyTypes\s*:=.*(scope_access|step_up_auth|allowed_types)
TRIGGER_PATH: packages/mcp-protocol/src/policy-engine.ts
TRIGGER_PATH: services/api/internal/handler/agent_handler.go
TRIGGER_PATH: apps/web/app/(vault)/agents/page.tsx

# References
- `packages/mcp-protocol/src/policy-engine.ts`
- `packages/mcp-protocol/src/policy-engine.test.ts`
- `services/api/internal/handler/agent_handler.go`
- `services/api/internal/handler/agent_handler_test.go`
- `apps/web/app/(vault)/agents/page.tsx`
