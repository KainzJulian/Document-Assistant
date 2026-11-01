# Pinned versions

Recorded 2026-11-01 from the lockfiles (`apps/api/uv.lock`, `apps/web/package-lock.json`). Rationale: [ADR 0001](adr/0001-versions.md).

## Runtime

| Component | Version |
| --- | --- |
| Node | 22 LTS (>= 22.22.3) |
| Python | 3.12 |
| Postgres + pgvector | 16 (`pgvector/pgvector:pg16`) |
| Caddy | 2 |

## Frontend (`apps/web`)

| Package | Version |
| --- | --- |
| @angular/core | 22.2.4 |
| @angular/cli, @angular/build | 22.2.5 |
| typescript | 6.0.3 (held below 7 by Angular 22) |
| tailwindcss, @tailwindcss/postcss | 4.3.3 |
| storybook, @storybook/angular-vite | 10.6.5 |
| eslint | 10.14.0 |
| angular-eslint | 22.6.0 |
| typescript-eslint | 8.72.1 |
| eslint-plugin-jsdoc | 65.4.2 |
| vite | 8.3.5 |
| vitest | 5.0.5 |
| playwright | 1.64.1 |

## Backend (`apps/api`)

| Package | Version |
| --- | --- |
| fastapi | 0.162.0 |
| starlette | 1.10.0 |
| uvicorn | 0.54.0 |
| pydantic | 2.14.2 |
| pydantic-settings | 2.16.2 |
| sqlalchemy | 2.1.6 |
| alembic | 1.20.1 |
| psycopg | 3.3.6 |
| procrastinate | 3.10.0 |
| argon2-cffi | 25.1.0 |
| cryptography | 50.0.2 |
| pgvector | 0.5.1 |
| ruff | 0.17.3 |
| mypy | 2.4.1 |
| pyright | 1.1.414 |
