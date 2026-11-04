# Wave 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A login-protected German app shell with sidebar, running as a local Compose stack (proxy, api, worker, db), with quality gates and ops scripts. Source of truth: `PLAN.md` sections 3, 6, 7 and 8 (Wave 0).

**Architecture:** Monorepo (`apps/web` Angular, `apps/api` FastAPI, `infra` Compose + Caddy). Postgres 16 + pgvector holds data and the Procrastinate job queue. Caddy serves the Angular build and proxies `/api/*`.

**Tech Stack:** Angular 22.2 (standalone, signals), TypeScript 6.0.x, Tailwind 4.3, Storybook 10.6, ESLint 10 + angular-eslint 22 + eslint-plugin-jsdoc; Python 3.12 with uv, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, psycopg 3, Procrastinate, argon2-cffi, mypy strict, pyright strict, ruff.

## Global Constraints

- UI language German, all strings in `apps/web/src/app/core/i18n/de.ts`. No emojis anywhere, icons only.
- No automated tests before W10. Each task ends with a hand Check logged in `docs/test-log.md`.
- Docstrings everywhere (Google style on Python, TSDoc on TypeScript). No `any` / `Any`. TS strict, `mypy --strict`, `pyright` strict.
- Comment tags per CLAUDE.md section 5 (TODO:, NOTE:, INFO:); no emojis in comments.
- Atomic layers `ui/{atoms,molecules,organisms,templates}`: only pages use stores.
- Every person-owned row carries `owner_id`; all queries go through one repository layer.
- Session cookie: HttpOnly, SameSite=Strict, 30 days sliding, no `Secure` flag. State-changing requests need header `X-Requested-With: app`.
- Errors use `{"error": {"code", "message", "details"}}` with German messages.
- Login lockout: 5 failures per 15 minutes locks the account for 15 minutes.
- Pin exact versions in `docs/versions.md`; latest stable unless incompatible (TypeScript is held at 6.0.x by Angular 22, recorded in the ADR).

---

### Task 1: W0.2 Compatibility spike and version record

**Files:**
- Create: `docs/adr/0001-versions.md`, `docs/versions.md`, `docs/test-log.md`

**Produces:** the pinned versions every later task installs. Findings already gathered 2026-11-01: Angular 22.2.4 / CLI 22.2.5 (Node `^22.22.3`; local Node 22.23.2 ok), `@storybook/angular` 10.6.5 supports Angular `>=18 <23`, `@angular/build` and `compiler-cli` require TypeScript `>=6.0 <6.1` (latest TS 7.0.2 unsupported), Tailwind 4.3.3, ESLint 10.14, angular-eslint 22.6, eslint-plugin-jsdoc 65.4.2, ngx-markdown 22.1.1, openapi-typescript 7.13.

- [ ] **Step 1:** Write the ADR (decision: Angular 22, TS 6.0.3, reasons above) and `docs/versions.md` (JS and Python tables, Postgres 16, Caddy 2, Node 22, Python 3.12). Final exact numbers are copied from the lockfiles after Task 2.
- [ ] **Step 2:** Create `docs/test-log.md` with a header and a table `| Task | Check | Result | Date |`.
- [ ] **Step 3: Commit** `docs: record version decisions (W0.2)` on branch `wave-0-foundation`.

---

### Task 2: W0.3 Monorepo and quality gates

**Files:**
- Create: `Makefile`, `.gitignore`, `.editorconfig`, `apps/api/pyproject.toml`, `apps/api/app/__init__.py`, `apps/web/**` (Angular CLI scaffold), `apps/web/eslint.config.js`, `apps/web/.storybook/*`
- Modify: `README.md`

**Interfaces:** Produces `make check` = `make check-api` + `make check-web`.
- `check-api`: `cd apps/api && uv run ruff check . && uv run mypy --strict app && uv run pyright`
- `check-web`: `cd apps/web && npm run lint && npx tsc -p tsconfig.app.json --noEmit && npm run build-storybook`

- [ ] **Step 1:** `uv init apps/api --package --python 3.12`; add runtime deps (fastapi, uvicorn, pydantic, pydantic-settings, sqlalchemy, alembic, psycopg[binary], procrastinate, argon2-cffi, cryptography) and dev deps (ruff, mypy, pyright). Configure ruff `select = ["D","ANN","E","F","I","UP"]`, `[tool.ruff.lint.pydocstyle] convention = "google"`, `ANN401` enabled (no `Any`), mypy `strict = true`, pyright `typeCheckingMode = "strict"`.
- [ ] **Step 2:** `npx @angular/cli@22.2.5 new web --directory apps/web --style css --routing --ssr false --skip-git --skip-tests`; pin `typescript@~6.0.3`; add Tailwind 4 (`tailwindcss`, `@tailwindcss/postcss`, `.postcssrc.json`, `@import "tailwindcss"` in `styles.css`).
- [ ] **Step 3:** Storybook: `npx storybook@10.6.5 init --type angular`, add `@storybook/addon-a11y` and autodocs. Create layer folders `src/app/{core,domain,state,pages}` and `src/app/ui/{atoms,molecules,organisms,templates}` with `.gitkeep`.
- [ ] **Step 4:** ESLint flat config: angular-eslint recommended, `@typescript-eslint/no-explicit-any: error`, `jsdoc/require-jsdoc` (classes, functions, methods, interfaces, type aliases), `no-restricted-imports` per layer (atoms import nothing from molecules and up; molecules only atoms; organisms atoms+molecules; ui never imports `state/` or `pages/`).
- [ ] **Step 5: Check (hand):** `make check` is green. Delete one docstring in `apps/api`: it fails. Add `x: Any` in Python and `: any` in TS: both fail. Revert. Log in `docs/test-log.md`.
- [ ] **Step 6: Commit** `feat: monorepo scaffold and quality gates (W0.3)`.

---

### Task 3: W0.4 Compose stack and database baseline

**Files:**
- Create: `infra/docker-compose.yml`, `infra/Caddyfile`, `infra/.env.example`, `apps/api/Dockerfile`, `apps/web/Dockerfile` (build stage only, output copied into the proxy image), `infra/Dockerfile.proxy`, `apps/api/alembic.ini`, `apps/api/migrations/env.py`, `apps/api/migrations/versions/0001_baseline.py`, `apps/api/app/db/{base.py,models.py,session.py}`, `apps/api/app/config.py`, `apps/api/app/jobs/{__init__.py,app.py,noop.py}`, `apps/api/app/main.py`, `apps/api/app/routers/health.py`

**Interfaces:**
- `app.config.Settings` (pydantic-settings): `database_url: str`, `fernet_key: str`, `session_days: int = 30`.
- `app.db.session.get_session() -> Iterator[Session]`.
- `app.jobs.app.procrastinate_app: procrastinate.App`; task `noop` returns `"ok"`.
- Compose services: `db` (image `pgvector/pgvector:pg16`), `api`, `worker` (same image, command `procrastinate --app=app.jobs.app.procrastinate_app worker`), `proxy` (Caddy 2, port 8080 -> 80). Volumes `pgdata`, `files`.
- `GET /api/health` -> `{"db": bool, "worker": bool, "ollama": bool, "providers": []}`; worker and ollama report `false` until later waves wire them.

- [ ] **Step 1:** Write all 14 SQLAlchemy 2 typed models exactly as PLAN.md section 6 (UUID pks, `citext` username, unique constraints, generated `tsvector` columns, `comment=` on every table and column). `chunk_embeddings.embedding` uses `pgvector.sqlalchemy.Vector()` without fixed dims (HNSW index per model is created by the W4 re-index job).
- [ ] **Step 2:** Alembic migration `0001_baseline`: `CREATE EXTENSION` for `vector`, `unaccent`, `pg_trgm`, `citext`; create all tables, GIN indexes on `tsv`, trigram index on `messages.content`; apply Procrastinate schema from `procrastinate.schema.SchemaManager`. Downgrade drops all.
- [ ] **Step 3:** FastAPI app with `/api` prefix, health router, German error envelope handler. Worker registers `noop`.
- [ ] **Step 4:** Caddyfile: `:80` serves `/srv/web`, `handle /api/*` -> `reverse_proxy api:8000` with `flush_interval -1` and `transport http { read_timeout 10m }`, SPA fallback to `index.html`.
- [ ] **Step 5: Check (hand):** `docker compose -f infra/docker-compose.yml up -d --build`; `alembic upgrade head` twice on an empty DB succeeds; `curl localhost:8080/api/health` answers; deferring `noop` shows a finished job in `procrastinate_jobs`. Log.
- [ ] **Step 6: Commit** `feat: compose stack, schema baseline and worker (W0.4)`.

---

### Task 4: W0.5 Accounts

**Files:**
- Create: `apps/api/app/security.py`, `apps/api/app/deps.py`, `apps/api/app/routers/{auth.py,users.py}`, `apps/api/app/models/auth.py` (Pydantic), `apps/api/app/cli.py`, `apps/web/src/app/core/{api.ts,auth.guard.ts}`, `apps/web/src/app/state/session.store.ts`, `apps/web/src/app/pages/{login,admin}/*`
- Modify: `Makefile` (`create-admin`)

**Interfaces:**
- `security.hash_password(plain: str) -> str`, `verify_password(hash: str, plain: str) -> bool` (argon2-cffi).
- `security.new_session_token() -> tuple[str, str]` (raw, sha256 hex stored as `sessions.id`).
- `deps.current_user`, `deps.require_admin`, `deps.require_csrf_header` (checks `X-Requested-With: app` on non-GET).
- Endpoints per PLAN.md section 7: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET/POST /users`, `PATCH /users/{id}`.
- Lockout: three columns on `users` (`failed_logins`, `failed_window_started_at`, `locked_until`); keeps the 14 tables of PLAN.md.

- [ ] **Step 1:** Implement security helpers, session issue and sliding expiry (update `last_seen_at`, extend `expires_at` by 30 days), cookie `sid` (HttpOnly, SameSite=Strict, max-age 30 d, no Secure).
- [ ] **Step 2:** Login with lockout (5 failures / 15 min, then 15 min lock), generic German error to avoid username enumeration, disabled users rejected.
- [ ] **Step 3:** Admin user endpoints; `make create-admin` runs `python -m app.cli create-admin` prompting for username and password.
- [ ] **Step 4:** Angular: `api.ts` fetch wrapper adds `X-Requested-With: app` and `credentials: 'same-origin'`; `session.store.ts` signal store; login page; admin page (create user, reset password, disable). Guards redirect to `/login`.
- [ ] **Step 5: Check (hand):** admin creates a member; the member logs in on a second device; stays logged in after closing the browser; 6 wrong passwords lock the account. Log.
- [ ] **Step 6: Commit** `feat: accounts, sessions and admin user page (W0.5)`.

---

### Task 5: W0.6 App shell and sidebar

**Files:**
- Create: `apps/web/src/app/core/i18n/de.ts`, `apps/web/src/app/ui/atoms/{button,icon,input,textarea,chip,badge,spinner}/*`, `ui/molecules/{menu,toast,empty-state}/*`, `ui/organisms/dialog/*`, `ui/templates/app-shell/*`, each with a `*.stories.ts`; `apps/web/src/app/app.routes.ts`
- Use `ui-ux-pro-max` for tokens and style (writes `design-system.md` to the brain).

**Interfaces:** `app-shell` template: content projection for `<router-outlet>`; inputs `user`, outputs `newChat`, `navigate`; sidebar 280 px fixed at `>= 1024px` (collapsible), drawer with menu button below. Order: Neuer Chat, Bibliothek, chat search field, chat list (placeholder), Einstellungen, user menu.

- [ ] **Step 1:** Run `ui-ux-pro-max`, define tokens (light/dark) in `styles.css` as CSS variables mapped into Tailwind `@theme`.
- [ ] **Step 2:** Build atoms, molecules, organisms, and the template; every component standalone, signals, OnPush, TSDoc on class and inputs; one story each with light/dark and phone viewport.
- [ ] **Step 3:** Wire routes: `/login`, `/` (new chat placeholder), `/library`, `/settings`, `/admin` inside the shell; German strings only from `de.ts`.
- [ ] **Step 4: Check (hand):** `npm run build-storybook` renders all stories; shell behaves at 1440, 820 and 390 px widths. Log.
- [ ] **Step 5: Commit** `feat: app shell, sidebar and base components (W0.6)`.

---

### Task 6: W0.7 Ops basics

**Files:**
- Create: `infra/scripts/{backup.sh,restore.sh,update.sh}`, `docs/setup.md`
- Modify: `Makefile` (`backup`, `restore`, `update`)

- [ ] **Step 1:** `backup.sh`: `docker compose exec db pg_dump -Fc` to `backups/<ts>/db.dump`, plus tar of the `files` volume. `restore.sh <dir>`: recreate DB, `pg_restore`, untar volume. `update.sh`: `git pull`, rebuild, `alembic upgrade head`, restart.
- [ ] **Step 2:** `docs/setup.md`: prerequisites, `.env` creation (Fernet key generation command), first admin, ufw rule for 8080 (mini PC step, yours), Ollama sharing decision (yours).
- [ ] **Step 3: Check (hand):** backup, wipe the db volume, restore, login still works and an uploaded file placeholder is present. Log.
- [ ] **Step 4: Commit** `feat: backup, restore and update scripts (W0.7)`.

---

### Wrap-up

- [ ] Write the project brain (`~/.claude/brain/Document Assistant/`: README, stack, conventions, decisions, architecture, state/status, next-steps).
- [ ] Verify W0 exit criteria: two accounts from different devices, shell works on all widths, `make check` green.

## Self-Review (spec coverage)

- W0.2 -> Task 1; W0.3 -> Task 2; W0.4 -> Task 3; W0.5 -> Task 4; W0.6 -> Task 5; W0.7 -> Task 6. W0.1 (server, ufw, Ollama choice) is the user's; the Compose project it needs is authored in Task 3.
- Deviations: lockout lives in 3 columns on `users`; design is "Salbei" (icon-free, no sidebar collapse, no menu molecule); chip and icon atoms were dropped. Status: Wave 0 done, see `docs/test-log.md`.
- Task code is specified at interface level rather than full listings because the Angular and Storybook scaffolds are generated by their CLIs; exact generated files are not knowable before running them.
