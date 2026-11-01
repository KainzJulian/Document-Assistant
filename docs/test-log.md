# Test log

Hand Checks per task until W10 (automated tests).

| Task | Check | Result | Date |
| --- | --- | --- | --- |
| W0.2 | Versions resolved; Angular 22 + Storybook 10.6 + Tailwind 4.3 install and build | pass | 2026-11-01 |
| W0.3 | `make check` green on clean tree | pass | 2026-11-01 |
| W0.3 | Missing docstring (Python D103, TS jsdoc), `Any` (ANN401), `any` (no-explicit-any) and atomic-layer import each fail lint | pass | 2026-11-01 |
| W0.4 | Migrations: upgrade, upgrade (no-op), downgrade, upgrade, downgrade, upgrade all succeed on an empty DB; 14 app tables + 4 Procrastinate tables; extensions vector, unaccent, pg_trgm, citext | pass | 2026-11-01 |
| W0.4 | Stack up (db, api, worker, proxy); `/api/health` through Caddy returns db=true, worker=true; checked from inside the Docker network (host curl was declined), not from a phone | pass (partial) | 2026-11-01 |
| W0.4 | `procrastinate defer noop` runs in the worker and ends `succeeded`; SPA fallback and accent-insensitive tsvector verified | pass | 2026-11-01 |
| W0.5 (api) | CSRF header enforced; login/logout/me; HttpOnly + SameSite=Strict + 30-day persistent cookie, no Secure; admin creates member; member blocked from /users (403); duplicate 409; 5 failures lock account (429) even with right password; password reset lifts lock and ends sessions; disable ends sessions; admin cannot disable self; unknown user and wrong password give the same 401. Run from inside the Docker network, 24/24 | pass | 2026-11-01 |
