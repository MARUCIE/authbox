PROJECT_NAME := $(shell basename $(CURDIR))
COMPOSE_FILE := docker-compose.yml

.PHONY: help setup dev dev-api dev-full build test typecheck lint clean up down restart logs status health \
        shell-api shell-web shell-db logs-api logs-web \
        migrate migrate-down migrate-status test-crypto test-api \
        full-loop-check postmortem-scan risk-classify release-gate agent-route agent-design-check

# ─── Setup ────────────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}'

setup: ## Install dependencies (pnpm + turbo)
	@echo "Installing dependencies..."
	@pnpm install
	@echo "Done. Run 'make dev' to start."

# ─── Development ──────────────────────────────────────────────────────────────

dev: up migrate ## Start infra + run migrations + web dev server
	@pnpm turbo run dev --filter=@authbox/web

dev-api: up migrate ## Start infra + run migrations + Go API (local, hot reload not included)
	@cd services/api && AUTH_BOX_DB_DSN="$(DB_DSN)" AUTH_BOX_ALLOWED_ORIGINS="http://localhost:3010,http://localhost:3000" go run cmd/api/main.go

dev-full: up migrate ## Start infra + migrations + API + web (requires two terminals or background)
	@echo "Starting Go API in background..."
	@cd services/api && AUTH_BOX_DB_DSN="$(DB_DSN)" AUTH_BOX_ALLOWED_ORIGINS="http://localhost:3010,http://localhost:3000" go run cmd/api/main.go &
	@sleep 2
	@echo "Starting web dev server..."
	@pnpm turbo run dev --filter=@authbox/web

build: ## Build all packages
	@pnpm turbo run build

test: ## Run all tests
	@pnpm turbo run test

test-crypto: ## Run crypto package tests
	@cd packages/crypto && pnpm test

test-api: ## Run Go API tests
	@cd services/api && go test ./...

typecheck: ## TypeScript type checking
	@pnpm turbo run typecheck

lint: ## Lint all packages
	@pnpm turbo run lint

clean: ## Remove build artifacts
	@pnpm turbo run clean
	@rm -rf node_modules .turbo

# ─── Docker ───────────────────────────────────────────────────────────────────

up: ## Start Docker services (postgres, redis, api)
	@echo "Starting $(PROJECT_NAME) infrastructure..."
	@docker compose -f $(COMPOSE_FILE) up -d postgres redis
	@echo "Waiting for services..."
	@sleep 3
	@docker compose -f $(COMPOSE_FILE) ps

down: ## Stop all Docker services
	@docker compose -f $(COMPOSE_FILE) down

restart: down up ## Restart Docker services

logs: ## View all logs (follow mode)
	@docker compose -f $(COMPOSE_FILE) logs -f --tail=100

logs-api: ## View API logs only
	@docker compose -f $(COMPOSE_FILE) logs -f --tail=100 api

logs-web: ## View web logs only
	@docker compose -f $(COMPOSE_FILE) logs -f --tail=100 web

status: ## Show service status
	@echo "=== $(PROJECT_NAME) Status ==="
	@docker compose -f $(COMPOSE_FILE) ps

health: ## Check service health
	@echo "=== $(PROJECT_NAME) Health ==="
	@docker compose -f $(COMPOSE_FILE) ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
	@echo ""
	@echo "--- API Health ---"
	@curl -sf http://localhost:4010/health 2>/dev/null || echo "API not running"

shell-api: ## Open shell in API container
	@docker compose -f $(COMPOSE_FILE) exec api sh

shell-web: ## Open shell in web container
	@docker compose -f $(COMPOSE_FILE) exec web sh

shell-db: ## Open psql in postgres container
	@docker compose -f $(COMPOSE_FILE) exec postgres psql -U auth_box auth_box

# ─── Migrations ───────────────────────────────────────────────────────────────

DB_DSN ?= postgres://auth_box:auth_box_dev@localhost:5410/auth_box?sslmode=disable

migrate: ## Run database migrations
	@echo "Running migrations..."
	@cd services/api && AUTH_BOX_DB_DSN="$(DB_DSN)" go run cmd/api/main.go --migrate-only
	@echo "Done."

migrate-down: ## Rollback last migration
	@echo "Rolling back migration..."
	@cd services/api && AUTH_BOX_DB_DSN="$(DB_DSN)" go run cmd/api/main.go --migrate-down
	@echo "Done."

migrate-status: ## Show migration status
	@docker compose -f $(COMPOSE_FILE) exec postgres psql -U auth_box auth_box -c "SELECT * FROM schema_migrations ORDER BY version;"

# ─── Docker Build (full stack) ────────────────────────────────────────────────

docker-build: ## Build all Docker images
	@echo "Building $(PROJECT_NAME) images..."
	@docker compose -f $(COMPOSE_FILE) build --no-cache
	@echo "Done."

docker-up: ## Start full stack in Docker (api + web)
	@docker compose -f $(COMPOSE_FILE) up -d
	@echo "Full stack started. API: http://localhost:4010 Web: http://localhost:3010"

# ─── SOP Automation (preserved from v1) ───────────────────────────────────────

full-loop-check: ## Run full-loop closure check (entry/system/contract/verification)
	@scripts/full_loop_closure_check.sh --project-dir .

postmortem-scan: ## Run postmortem trigger scan (local gate)
	@scripts/postmortem_scan.sh --base 007eff50b0400d8642f798419b6cc5e2bf4b5c4c --head HEAD

risk-classify: ## Classify release risk (P0/P1/P2)
	@scripts/release_risk_classify.sh --base $${BASE:-HEAD~1} --head $${HEAD:-HEAD}

release-gate: ## Run Layer A/B release gate
	@if [ -n "$${GATEKEEPER:-}" ]; then \
		scripts/release_gate.sh --base $${BASE:-HEAD~1} --head $${HEAD:-HEAD} --gatekeeper "$${GATEKEEPER}"; \
	else \
		scripts/release_gate.sh --base $${BASE:-HEAD~1} --head $${HEAD:-HEAD}; \
	fi

agent-route: ## Decide routing by trigger text
	@if [ -z "$${TEXT:-}" ]; then \
		echo "ERROR: TEXT is required. Example: make agent-route TEXT='...'"; \
		exit 2; \
	fi
	@scripts/agent_router_decide.sh --text "$${TEXT}"

agent-design-check: ## Validate professional agent design config+docs
	@scripts/agent_design_check.sh
