# Document Assistant

German-language household web app: a personal library of documents and web pages, summaries in five lengths, and chat over selected documents with citations. Angular + FastAPI + Postgres/pgvector.

## Folders

```
backend/              FastAPI app (app/), migrations, tests, eval scripts
frontend/             Angular app, Storybook, Playwright specs (e2e/), Caddy proxy (Dockerfile, Caddyfile)
docker-compose.yml    the stack: db, api, worker, proxy (docker-compose.test.yml and .e2e.yml for the tests)
.env.example          copy to .env and fill in
scripts/              backup, restore, update, GPU detection
hardware/             hardware.json written by scripts/detect-gpu.sh
docs/                 setup, user guide, acceptance, hand checks, evaluation reports
PLAN.md               the plan this app was built from (it still says apps/api and apps/web)
```

- Plan: [PLAN.md](PLAN.md)
- Setup: [docs/setup.md](docs/setup.md)
- Acceptance and tests: [docs/acceptance.md](docs/acceptance.md)
- Versions: [docs/versions.md](docs/versions.md)

## Commands

```
make check         # lint + types + Storybook build (backend and frontend)
make test-unit     # fast tests, no Docker
make test          # unit + api + Storybook tests
make test-e2e      # browser tests against a throwaway stack
make up            # build and start the stack on :8080
make create-admin  # create the first admin account
make backup        # database dump + files volume
```
