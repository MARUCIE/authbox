# PR for punkpeye/awesome-mcp-servers

## Entry to add (under "Security" or "Identity" category):

- [Auth Box](https://github.com/MARUCIE/authbox) - Zero-knowledge password manager with MCP credential gateway. Gives AI agents policy-gated access to credentials (scope, rate limits, time windows, step-up approval). BIP-39 seed phrase recovery. 70+ API key providers.

## PR Title:
Add Auth Box -- MCP credential gateway for AI agents

## PR Body:
Auth Box is an open-source (MIT) password manager with a built-in MCP server that provides AI agents controlled access to credentials.

**MCP capabilities:**
- Policy engine: scope, rate limits, time windows, step-up approval
- Per-agent delegation keys (HD derivation from seed phrase)
- Audit trail with hash-chain integrity verification
- 70+ API key provider management

**Tech:** Go API + Next.js 15 + TypeScript + Chrome MV3 Extension

144 automated tests, security audited.
