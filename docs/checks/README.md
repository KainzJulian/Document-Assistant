# Checks

## Automated tests

| Command | What it runs | Needs |
| --- | --- | --- |
| `make test-unit` | `backend/tests/unit` (pytest, no database) and the Vitest `unit` project | none |
| `make test-api` | pytest in `backend/tests` against a throwaway Postgres (port 55432) with the fake model; fails below 85 percent coverage | Docker |
| `make test-web` | Vitest: unit project plus the Storybook component and interaction tests | `npx playwright install chromium` once |
| `make test-e2e` | Playwright: one spec per acceptance criterion against a throwaway stack (fake model, fake hardware, local web pages) on port 8090 | Docker, Chromium |
| `make test` | `test-api` and `test-web` | as above |

`make test-down` removes the test database. `docs/acceptance.md` maps every criterion to its test. Log each run in `docs/test-log.md`.

## Checks that need a real model, real keys or real hardware

These talk to a running stack (`make up`) and are run by hand. The scripts assume a user `julian` / `Test-Passw0rd-1`; edit the constants at the top of a script to use your own. API scripts run inside the api container: `docker exec -i doc-assistant-api-1 python - < docs/checks/<script>.py`.

| Wave | Script or list | Needs |
| --- | --- | --- |
| W3 providers | `w3-manual.md` | real keys, the mini PC |
| W4 indexing | `w4-manual.md`, `make-big-pdf.py`, `backend/eval/rag/run_retrieval.py` | Ollama + bge-m3 |
| W5 chat | `w5-chat-api.py`, `w5-w6-manual.md` | a real model, 2 sample PDFs ready |
| W7 summaries | `w7-summaries-api.py` | a real model, a short and a 200-page document |
| W8 evaluation | `backend/eval/run_summaries.py`, `backend/eval/run_rag.py`, guide in `docs/eval/README.md` | models, judge model key |
| W9 hardening | `w9-performance.py`, `w9-edge-cases.md`, `w9-manual.md` | stack |
| W1 extraction samples | `cd backend && uv run python eval/extraction/run.py` | none |
| W2 URL sample set | `docker exec -i doc-assistant-api-1 python - < backend/eval/urls/run.py` | stack with internet |
