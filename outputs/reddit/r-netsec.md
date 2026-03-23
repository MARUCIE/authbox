# r/netsec Post

**Title**: Auth Box -- zero-knowledge password manager using SRP-6a + BIP-39 + AES-256-GCM (security audit results inside)

**Body**:

I built Auth Box, an open-source password manager with a zero-knowledge architecture. Sharing for a security review from the community.

**Crypto stack**:
- **Key derivation**: BIP-39 (24 words) -> PBKDF2-HMAC-SHA512 -> HKDF-SHA256 with purpose-specific salts
- **Vault encryption**: AES-256-GCM (12-byte nonce, 16-byte tag, per-item encryption)
- **Authentication**: SRP-6a with RFC 5054 2048-bit group parameters. Password never transmitted.
- **Password derivation**: Argon2id (256MB memory, 3 iterations, 4 parallelism)
- **Deterministic passwords**: HMAC-SHA512 expansion from seed + site identifier

**Security audit results** (self-audit, 2 rounds):
- 12 findings identified and fixed
- TOTP bypass (CRITICAL -> fixed: SRP pending state now survives until TOTP verification)
- Timing attack on TOTP comparison (HIGH -> fixed: constant-time comparison)
- Session scoping (HIGH -> fixed: scoped logout + per-user session isolation)
- CORS hardening (HIGH -> fixed: production rejects localhost origins, not just logs)
- Rate limiter window extension (MEDIUM -> fixed: fixed-window replaces sliding-window)
- Email rate limiter memory leak (MEDIUM -> fixed: background cleanup + 10k cap)

**What I'd like reviewed**:
1. Is the HD key derivation (seed -> sub-keys via HKDF) sound?
2. Is double SHA-256 for the Arweave identity tag sufficient to prevent key recovery?
3. The MCP credential gateway exposes credentials to AI agents via policy gates -- is the trust model reasonable?

144 automated tests (28 Go + 51 crypto + 65 E2E). All cryptographic operations happen client-side.

GitHub: https://github.com/MARUCIE/authbox

MIT licensed. Tear it apart.
