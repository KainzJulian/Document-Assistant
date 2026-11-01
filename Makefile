.PHONY: check check-api check-web create-admin backup restore update up down

COMPOSE = docker compose -f infra/docker-compose.yml --env-file infra/.env

# Quality gate: lint + types + Storybook build (W0.3).
check: check-api check-web

check-api:
	cd apps/api && uv run ruff check . && uv run mypy --strict app && uv run pyright

check-web:
	cd apps/web && npm run lint && npm run typecheck && npm run build-storybook

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

# Creates the first admin (prompts for username and password).
create-admin:
	$(COMPOSE) exec api python -m app.cli create-admin

backup:
	sh infra/scripts/backup.sh

restore:
	sh infra/scripts/restore.sh $(DIR)

update:
	sh infra/scripts/update.sh
