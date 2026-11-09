# Hand checks

Scripts for the Check step of each plan task. They talk to a running stack (`make up`) and need the test users below. Results go into `docs/test-log.md`.

## Setup

- Start the stack: `make up`, create an admin with `make create-admin` (the scripts assume `julian` / `Test-Passw0rd-1`; edit the constants at the top of a script to use your own).
- Some W1 and W2 UI scripts also use a second user `dora` / `Dora-Passw0rd-1` (create it on the "Benutzer" page).
- Browser scripts use Playwright with the installed Chrome. From `apps/web`:
  `NODE_PATH=node_modules node ../../docs/checks/<script>.cjs <baseUrl> <outDir>` (some take a samples folder, see the header of each file).
- API scripts run inside the api container: `docker exec -i doc-assistant-api-1 python - < docs/checks/<script>.py`

## Scripts

| Wave | Script | Needs |
| --- | --- | --- |
| W0 accounts and shell | `w0-accounts-ui.cjs <baseUrl> <outDir>` | stack, user julian |
| W1 documents API | `w1-documents-api.py` | stack; copy `eval/extraction/samples` to `/tmp/samples` in the container (`docker cp`) |
| W1 library UI | `w1-library-ui.cjs <baseUrl> <samplesDir> <outDir>` | stack, users julian and dora, empty library |
| W2 import UI | `w2-import-ui.cjs <baseUrl> <outDir>` | stack with internet |
| W3 providers, rules, account | `w3-providers-api.py` (inside the api container) and `w3-manual.md` | stack; the manual list needs real keys and the mini PC |
| W4 chunker | `cd apps/api && uv run python ../../docs/checks/w4-chunking.py` | none |
| W4 indexing and retrieval | `w4-indexing-api.py` (inside the api container), `eval/rag/run_retrieval.py`, `w4-manual.md`, `make-big-pdf.py` | stack; Ollama + bge-m3 for the vector part |
| W5 chat | `w5-chat-api.py` (needs a real model), `w5-w6-manual.md` | stack, model configured, 2 sample PDFs ready |
| W6 chat search | `w6-search-api.py` (inside the api container) | stack |
| W7 summaries | `w7-summaries-api.py` (inside the api container; rules need no model, live part needs one) | stack, model, a short and a 200-page document |
| W8 evaluation | `eval/run_summaries.py`, `eval/run_rag.py`, guide in `docs/eval/README.md` | stack, models, judge model key |
| W9 performance and edge cases | `w9-performance.py` (inside the api container), `w9-edge-cases.md`, `w9-manual.md` | stack |
| W1 extraction samples | `cd apps/api && uv run python ../../eval/extraction/run.py` | none |
| W2 URL sample set | `docker exec -i doc-assistant-api-1 python - < eval/urls/run.py` | stack with internet |

## Automated tests (W10)

These replace the hand scripts above for repeat runs. Nothing in W3 to W10 has been run yet; run them in this order and record the results in `docs/test-log.md`.

| Command | What it runs | Needs |
| --- | --- | --- |
| `make test-unit` | Unit tests only: `apps/api/tests/unit` (pytest, no database) and the Vitest `unit` project (domain helpers, API client, stores, services) | none |
| `make test-api` | pytest in `apps/api/tests` against a throwaway Postgres (port 55432) with the fake model; fails below 85 percent coverage | Docker |
| `make test-web` | Vitest: `unit` project (domain helpers, SSE client) and the Storybook component and interaction tests | `npx playwright install chromium` once |
| `make test-e2e` | Playwright: one spec per acceptance criterion against a throwaway stack (fake model, fake hardware, local web pages) on port 8090 | Docker, `npx playwright install chromium` once |
| `make test` | `test-api` and `test-web` | as above |

`make test-down` removes the test database. The e2e stack removes itself when the run ends. `docs/acceptance.md` maps every criterion to its test.

Later waves add their scripts here (see the table in each wave's section of `docs/test-log.md`).
