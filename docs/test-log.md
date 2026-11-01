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
