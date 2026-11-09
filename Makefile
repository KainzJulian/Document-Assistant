.PHONY: docs docs-api docs-web ollama-pull hw-refresh check check-api check-web gen-api create-admin backup restore update up down test test-unit test-db test-down test-api test-web test-e2e

# Reads docker-compose.yml and .env from this folder.
COMPOSE = docker compose

# Quality gate: lint + types + Storybook build (W0.3).
check: check-api check-web

check-api:
	cd backend && uv run ruff check . && uv run mypy --strict app && uv run pyright

check-web:
	cd frontend && npm run lint && npm run typecheck && npm run build-storybook

# Automated tests (W10). Backend and e2e use the fake provider: no keys, no network, no Ollama.
test: test-api test-web

# Unit tests only: no Docker, no database, no browser (about a minute).
test-unit:
	cd backend && uv run pytest tests/unit --no-cov
	cd frontend && npm run test:unit

# Disposable Postgres on port 55432 for the backend tests.
test-db:
	docker compose -f docker-compose.test.yml up -d --wait

test-down:
	docker compose -f docker-compose.test.yml down

test-api: test-db
	cd backend && uv run pytest

# Unit tests of the pure frontend code plus the Storybook component and interaction tests.
test-web:
	cd frontend && npm test

# Browser tests of the 20 acceptance criteria against a throwaway stack (see docs/acceptance.md).
# Builds the stack (fake model, fixed fake hardware, local web pages), creates the admin, runs Playwright
# and always removes the stack again. First run: `cd frontend && npx playwright install chromium`.
E2E = docker compose -f docker-compose.e2e.yml

test-e2e:
	$(E2E) up -d --build --wait
	$(E2E) exec -T api python -m app.cli create-admin --username admin --password Admin-Passw0rd-1 || true
	cd frontend && npx playwright test; status=$$?; cd .. && $(E2E) down -v; exit $$status

# Regenerates the TypeScript API types from the FastAPI schema (no running server needed).
# NOTE: run through npx because openapi-typescript 7 peers on TypeScript 5, Angular 22 needs 6.
gen-api:
	cd backend && DATABASE_URL=postgresql+psycopg://x:x@localhost/x uv run python -c "import json; from app.main import app; json.dump(app.openapi(), open('../frontend/openapi.json', 'w'))"
	cd frontend && npx --yes openapi-typescript@7.13.0 openapi.json -o src/app/core/api-schema.ts

# Generated reference docs (docs/reference/): Python with pdoc, Angular with Compodoc.
docs: docs-api docs-web

docs-api:
	cd backend && DATABASE_URL=postgresql+psycopg://x:x@localhost/x uv run --with pdoc pdoc -o ../docs/reference/api app

docs-web:
	cd frontend && npx --yes @compodoc/compodoc -p tsconfig.app.json -d ../docs/reference/web --disableCoverage

# Pulls the default embedding model into the project's own Ollama (profile ollama must run).
ollama-pull:
	$(COMPOSE) exec ollama ollama pull bge-m3

# Re-reads GPU name and VRAM (nvidia-smi or rocm-smi) for the Ollama hardware check.
hw-refresh:
	sh scripts/detect-gpu.sh

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

# Creates the first admin (prompts for username and password).
create-admin:
	$(COMPOSE) exec api python -m app.cli create-admin

backup:
	sh scripts/backup.sh

restore:
	sh scripts/restore.sh $(DIR)

update:
	sh scripts/update.sh
