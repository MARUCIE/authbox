# r/selfhosted Post

**Title**: Auth Box -- self-hosted password manager that survives without the server (seed phrase + deterministic passwords)

**Body**:

I built an open-source password manager where the server is optional.

**How it works**: Your vault is encrypted with keys derived from a BIP-39 seed phrase (same 24-word model as Bitcoin wallets). The server stores only encrypted blobs it cannot decrypt. If you lose access to the server, your 24 words can regenerate every key.

**Key features for self-hosters**:

- **Zero-knowledge architecture** -- server stores encrypted blobs only. SRP-6a auth means your password never touches the wire.
- **Deterministic passwords** -- `seed + "github.com" + "myuser" = password`. No storage needed. Same seed = same password, every time.
- **Docker Compose one-liner** -- `make dev-full` spins up Postgres + Redis + Go API + Next.js frontend
- **Import from 13 sources** -- Apple, Google, Chrome, 1Password, Bitwarden, LastPass, KeePass, etc.
- **AI Agent gateway** -- MCP protocol server gives AI assistants controlled credential access with policy gates
- **Arweave backup** -- archive your encrypted vault on-chain for permanent storage

**Stack**: Go API (chi v5, pgx v5) + Next.js 15 + React 19 + Chrome MV3 Extension + Turborepo monorepo

144 automated tests. Security audited (12 findings fixed). MIT licensed.

GitHub: https://github.com/MARUCIE/authbox

Happy to answer questions about the crypto implementation or self-hosting setup.
