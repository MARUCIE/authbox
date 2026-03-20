# Contributing to Auth Box

Auth Box is an open-source, zero-knowledge password manager with seed phrase sovereignty. We welcome contributions.

## Development Setup

### Prerequisites

- Node.js 22+
- pnpm 10+
- Go 1.22+
- Docker (for PostgreSQL + Redis)

### Quick Start

```bash
git clone https://github.com/MARUCIE/10-auth-box.git
cd 10-auth-box
pnpm install
make dev-full
```

### Project Structure

- `packages/crypto/` -- Core cryptography (BIP-39, HD keys, AES-256-GCM, SRP-6a)
- `packages/shared/` -- Shared types and validation
- `packages/mcp-protocol/` -- MCP WebSocket server + policy engine
- `apps/web/` -- Next.js 15 web application
- `apps/console/` -- Public portal + admin dashboard
- `apps/extension/` -- Chrome MV3 extension
- `services/api/` -- Go API server

### Running Tests

```bash
make test-crypto    # 21 seed phrase + HD key tests
make test-api       # 6 SRP-6a protocol tests
make build          # Build all packages
```

## Guidelines

- **Security first**: All crypto changes require test coverage. No exceptions.
- **No server dependency for core**: Vault must work offline. Server is optional sync.
- **Seed phrase is sacred**: Never log, transmit, or store the seed phrase on any server.
- **Vault Onyx design**: Follow the design system in `design/VAULT_ONYX_DESIGN_SYSTEM.md`.

## License

MIT -- see [LICENSE](LICENSE).
