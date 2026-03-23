# PR for awesome-selfhosted/awesome-selfhosted

## Entry to add (under "Password Managers" category):

- [Auth Box](https://github.com/MARUCIE/authbox) - Zero-knowledge password manager using BIP-39 seed phrases. Deterministic password derivation, AI agent MCP gateway, import from 13 sources. `Go` `TypeScript` `Docker` `MIT`

## PR Title:
Add Auth Box to Password Managers

## PR Body:
Auth Box is a self-hosted, zero-knowledge password manager.

- **Zero-knowledge**: server stores only encrypted blobs (AES-256-GCM). SRP-6a authentication.
- **Seed phrase recovery**: BIP-39 24-word mnemonic derives all keys. Works without server.
- **Deterministic passwords**: derive passwords from seed + site name. No storage needed.
- **AI Agent gateway**: MCP protocol for controlled credential access.
- **Docker Compose**: one-command setup (Postgres + Redis + Go API + Next.js)
- **Import**: Apple, Google, Chrome, 1Password, Bitwarden, LastPass, KeePass, and 6 more.

MIT licensed. 144 automated tests.
