PROJECT_NAME := $(shell basename $(CURDIR))
COMPOSE_FILE := docker-compose.yml

.PHONY: help up down restart logs status clean build shell-api shell-console shell-db logs-api logs-console health dev watch real-api-capture real-api-replay full-loop-check postmortem-scan risk-classify release-gate

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

up: ## Start all services
	@echo "Starting $(PROJECT_NAME)..."
	@docker compose -f $(COMPOSE_FILE) up -d
	@echo "Done. Run 'make status' to check."

down: ## Stop all services
	@echo "Stopping $(PROJECT_NAME)..."
	@docker compose -f $(COMPOSE_FILE) down
	@echo "Done."

restart: down up ## Restart all services

logs: ## View logs (follow mode)
	@docker compose -f $(COMPOSE_FILE) logs -f --tail=100

logs-api: ## View API logs only
	@docker compose -f $(COMPOSE_FILE) logs -f --tail=100 api

logs-console: ## View console logs only
	@docker compose -f $(COMPOSE_FILE) logs -f --tail=100 console

status: ## Show service status
	@echo "=== $(PROJECT_NAME) Status ==="
	@docker compose -f $(COMPOSE_FILE) ps

health: ## Check service health
	@echo "=== $(PROJECT_NAME) Health Check ==="
	@docker compose -f $(COMPOSE_FILE) ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

clean: ## Remove containers, volumes, and images
	@echo "Cleaning $(PROJECT_NAME)..."
	@docker compose -f $(COMPOSE_FILE) down -v --rmi local
	@echo "Done."

build: ## Rebuild images
	@echo "Building $(PROJECT_NAME)..."
	@docker compose -f $(COMPOSE_FILE) build --no-cache
	@echo "Done."

shell-api: ## Open shell in API container
	@docker compose -f $(COMPOSE_FILE) exec api sh

shell-console: ## Open shell in console container
	@docker compose -f $(COMPOSE_FILE) exec console sh

shell-db: ## Open psql in postgres container
	@docker compose -f $(COMPOSE_FILE) exec postgres psql -U auth_box auth_box

# Development shortcuts
dev: up logs ## Start and follow logs
watch: ## Watch for changes (requires entr)
	@find . -name "*.ts" -o -name "*.tsx" | entr -r make restart

real-api-capture: ## Run real API core flow and refresh fixtures
	@services/api/scripts/real_api_core_flow.sh --mode capture --project-dir .

real-api-replay: ## Replay regression flow against real API (no mock)
	@services/api/scripts/replay_real_api_fixtures.sh --project-dir .

full-loop-check: ## Run full-loop closure check (entry/system/contract/verification)
	@scripts/full_loop_closure_check.sh --project-dir .

postmortem-scan: ## Run postmortem trigger scan (local gate)
	@scripts/postmortem_scan.sh --base 007eff50b0400d8642f798419b6cc5e2bf4b5c4c --head HEAD

risk-classify: ## Classify release risk (P0/P1/P2). Usage: make risk-classify BASE=<sha> HEAD=<sha>
	@scripts/release_risk_classify.sh --base $${BASE:-HEAD~1} --head $${HEAD:-HEAD}

release-gate: ## Run Layer A/B release gate. Usage: make release-gate BASE=<sha> HEAD=<sha> GATEKEEPER=<name>
	@if [ -n "$${GATEKEEPER:-}" ]; then \
		scripts/release_gate.sh --base $${BASE:-HEAD~1} --head $${HEAD:-HEAD} --gatekeeper "$${GATEKEEPER}"; \
	else \
		scripts/release_gate.sh --base $${BASE:-HEAD~1} --head $${HEAD:-HEAD}; \
	fi
