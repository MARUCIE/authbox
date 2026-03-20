# Auth Box v2

Zero-knowledge encrypted password manager + authorization manager + AI agent gateway.

## Architecture

```
Client (holds decrypted vault)          Server (encrypted blobs only)
+-----------------------------+         +---------------------------+
| Web App     Extension       |  E2E    | Auth (SRP-6a)             |
| (Next.js)   (Chrome MV3)   | ------> | Vault (encrypted CRUD)    |
|                             |         | Agents + Policies (JSONB) |
| @authbox/crypto (WASM)     |         | Audit (hash chain)        |
| MCP Gateway (WebSocket)    |         | PostgreSQL + Redis        |
+-----------------------------+         +---------------------------+
```

## Quick Start

Prerequisites: Node.js 22+, pnpm 10+, Go 1.22+, Docker

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment config
cp .env.example .env

# 3. Start Postgres + Redis, run migrations, start web dev server
make dev

# 4. In a second terminal, start the Go API
make dev-api

# Or start everything in one command (API backgrounded)
make dev-full
```

- Web app: http://localhost:3010
- API: http://localhost:4010
- Health check: http://localhost:4010/health

## Monorepo Structure

```
packages/
  crypto/           @authbox/crypto     -- Argon2id, AES-256-GCM, SRP-6a, HKDF
  shared/           @authbox/shared     -- Types, validation schemas
  mcp-protocol/     @authbox/mcp-protocol -- AI gateway (MCP over WebSocket)
apps/
  web/              @authbox/web        -- Next.js 15 dashboard
  extension/        auth-box-extension  -- Chrome MV3 (popup + content + background)
services/
  api/              auth-box-api        -- Go API (chi v5, pgx v5)
```

## Key Commands

| Command | Description |
|---------|-------------|
| `make setup` | Install pnpm dependencies |
| `make dev` | Start infra + migrations + web dev server |
| `make dev-api` | Start infra + migrations + Go API |
| `make dev-full` | Start everything (API + web) |
| `make build` | Build all packages (turbo) |
| `make migrate` | Run database migrations |
| `make migrate-down` | Rollback last migration |
| `make up` | Start Docker infra (Postgres, Redis) |
| `make down` | Stop Docker infra |
| `make health` | Check service health |
| `make test` | Run all tests |
| `make test-api` | Run Go API tests |
| `make test-crypto` | Run crypto package tests |

## Docker (Full Stack)

```bash
make docker-build   # Build all images
make docker-up      # Start API + Web + Postgres + Redis
```

## API Routes

| Group | Endpoints |
|-------|-----------|
| Auth (SRP, public) | `POST /api/v1/auth/{register,login/init,login/verify}` |
| Auth (protected) | `POST logout`, `GET/DELETE sessions`, `POST totp/{enroll,verify,disable}` |
| Vault | `GET key`, `GET/POST sync`, `CRUD items` |
| Agents | `CRUD /api/v1/agents`, `CRUD agents/:id/policies` |
| Connections | `CRUD /api/v1/connections` |
| Audit | `GET /api/v1/audit`, `GET /api/v1/audit/verify` |

## Encryption

- Master password never leaves the client
- Argon2id key derivation (256MB memory, 3 iterations)
- HKDF sub-keys: auth (SRP), encryption (vault key wrap), MAC
- AES-256-GCM for all vault items
- SRP-6a mutual authentication (server never sees password)

## Documentation

```
doc/index.md                    # Documentation index
doc/00_project/                 # Project-level docs (PRD, architecture, UX map)
```
