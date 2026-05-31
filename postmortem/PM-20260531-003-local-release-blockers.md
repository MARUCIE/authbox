# PM-20260531-003 Local Release Blocker Class

## Symptom

Attacker review left multiple local release blockers after the SOP delivery pass:
SRP M2 proof gaps, API keys in query strings, MCP proxy SSRF/data exfiltration risk,
plaintext TOTP seed storage, broad extension permissions, and API PNA/content-type drift.

## Root Cause

Security-sensitive behavior was spread across clients, protocol tools, API middleware,
and UI flows without a single fail-closed release-blocker checklist. Several paths
had tests for the happy path but not for attacker-controlled inputs or post-auth trust
boundaries.

## Fix

- Clients verify SRP server proof M2 before trusting session/vault credentials.
- Active API key health/MCP auth paths avoid URL query secrets.
- MCP proxy requests pass through host/DNS/header/method/body sanitization.
- TOTP seeds are encrypted envelopes; plaintext stored seeds fail closed.
- API middleware emits PNA only for explicit preflight and parses JSON media types strictly.
- Settings hides manual TOTP setup values by default and clears enrollment state.
- Extension host permissions are narrowed.

## Prevention

- Keep release-blocker scans grouped by trust boundary: authentication, secret transport,
  proxy/network egress, second-factor storage, browser extension permissions, and API
  middleware behavior.
- Add negative tests before considering a blocker fixed.
- Treat public release as blocked until local fixes are committed and GitHub/VPS/production
  commit/API-health evidence is fresh.

## Triggers

- Paths:
  - `apps/web/lib/auth.ts`
  - `apps/extension/src/popup/App.tsx`
  - `apps/ios/AuthBox/Sources/Core/Network/APIClient.swift`
  - `packages/mcp-protocol/src/server.ts`
  - `packages/mcp-protocol/src/proxy-security.ts`
  - `services/api/internal/service/totp_service.go`
  - `services/api/internal/middleware/security.go`
  - `apps/extension/manifest.json`
- Keywords / regex:

TRIGGER_REGEX: searchParams\.get\(['"]api_key
TRIGGER_REGEX: \?key=\$\{
TRIGGER_REGEX: SetTOTPSecret\(ctx,\s*userID,\s*secret\)
TRIGGER_REGEX: strings\.HasPrefix\(.*application/json
TRIGGER_REGEX: "host_permissions":\s*\[\s*"\*://\*/\*"
TRIGGER_REGEX: "<all_urls>"

## Evidence

- `ai check`: PASS, `outputs/check/20260531-115040-dc90d291`.
- `pnpm --filter @authbox/crypto test`: PASS.
- `pnpm --filter @authbox/mcp-protocol test`: PASS.
- `(cd services/api && go test ./...)`: PASS.
- `(cd apps/ios/AuthBoxCrypto && swift test)`: PASS.
- Web/extension typecheck and build: PASS.
- iOS simulator build: PASS.
