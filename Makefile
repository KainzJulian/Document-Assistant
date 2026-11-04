.PHONY: check check-api check-web gen-api create-admin backup restore update up down

COMPOSE = docker compose -f infra/docker-compose.yml --env-file infra/.env

# Quality gate: lint + types + Storybook build (W0.3).
check: check-api check-web

check-api:
	cd apps/api && uv run ruff check . && uv run mypy --strict app && uv run pyright

check-web:
	cd apps/web && npm run lint && npm run typecheck && npm run build-storybook

# Regenerates the TypeScript API types from the FastAPI schema (no running server needed).
# NOTE: run through npx because openapi-typescript 7 peers on TypeScript 5, Angular 22 needs 6.
gen-api:
	cd apps/api && uv run python -c "import json; from app.main import app; json.dump(app.openapi(), open('../web/openapi.json', 'w'))"
	cd apps/web && npx --yes openapi-typescript@7.13.0 openapi.json -o src/app/core/api-schema.ts

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
