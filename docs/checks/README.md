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
| W1 extraction samples | `cd apps/api && uv run python ../../eval/extraction/run.py` | none |
| W2 URL sample set | `docker exec -i doc-assistant-api-1 python - < eval/urls/run.py` | stack with internet |

Later waves add their scripts here (see the table in each wave's section of `docs/test-log.md`).
