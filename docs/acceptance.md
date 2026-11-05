# Acceptance (W10.6)

The app is done when all 20 criteria pass. The tests below were written in W10 and have **not been run yet**. Run them, fix what fails (W10.5), run the whole suite twice in a row, then work through the hand checklist.

## 1. Run the automated suite

1. One-time: `cd apps/web && npx playwright install chromium`.
2. `make check` (lint, types, Storybook build).
3. `make test-api` (needs Docker; starts a disposable Postgres on port 55432).
4. `make test-web` (Vitest `unit` project and the Storybook interaction tests).
5. `make test-e2e` (builds a throwaway stack on port 8090 and removes it afterwards).
6. Everything green? Run steps 2 to 5 once more. Two green runs in a row are the exit criterion.
7. Record both runs in `docs/test-log.md`.

If a test fails, decide whether the app or the test is wrong. The tests were written without being run, so expect some wrong selectors and wrong guesses about text; the browser specs read the German texts in `apps/web/src/app/core/i18n/de.ts`.

## 2. Where each criterion is tested

| AC | Automated | By hand |
| --- | --- | --- |
| AC-1.1 File upload | `tests/test_documents.py` (every sample, bad files, empty PDF), `e2e/library.spec.ts` | 50 MB file (`docs/checks/w9-edge-cases.md`) |
| AC-1.2 URL import | `tests/test_helpers.py` (address rules), `e2e/url.spec.ts` (local pages) | 13 of 15 real URLs: `eval/urls/run.py` |
| AC-1.3 Automatic saving | `e2e/library.spec.ts` | |
| AC-1.4 Persistent library | `e2e/library.spec.ts` (logout, second device) | `make down` then `make up`, documents still there |
| AC-2.1 Summary generation | `tests/test_summaries.py`, `e2e/summary.spec.ts` | |
| AC-2.2 Length selection | `tests/test_summaries.py`, `tests/test_helpers.py`, `e2e/summary.spec.ts`, story `Length select / Choose` | |
| AC-2.3 Accurate output | `e2e/eval-report.spec.ts` reads the report | `eval/run_summaries.py` with your real model |
| AC-3.1 Chatbot interface | `tests/test_chat.py`, `e2e/chat.spec.ts` | stop button while streaming (W5 manual list) |
| AC-3.2 Document selection | `tests/test_chat.py`, `e2e/chat.spec.ts`, story `Document picker / SearchAndSelectAll` | |
| AC-3.3 Interactive Q&A | `tests/test_chat.py`, `e2e/chat.spec.ts`, `e2e/eval-report.spec.ts` | `eval/run_rag.py` with your real model |
| AC-4.1 Chat auto-save | `tests/test_chat.py`, `e2e/chat.spec.ts` (reload) | reload while an answer streams |
| AC-4.2 Chat search | `tests/test_chat.py`, `e2e/search.spec.ts` (500 chats, under 300 ms) | |
| AC-5.1 Sidebar | `e2e/navigation.spec.ts` | phone, tablet, desktop by eye |
| AC-5.2 Section switching | `e2e/navigation.spec.ts` | |
| AC-5.3 Chat management | `e2e/navigation.spec.ts` | |
| AC-6.1 Settings area | `e2e/settings.spec.ts` | |
| AC-6.2 Model choice | `tests/test_providers.py`, `e2e/settings.spec.ts` | each cloud provider with a real key (`docs/checks/w3-manual.md`) |
| AC-6.3 Ollama warning | `tests/test_hardware.py` (8 combinations), story `Ollama fit dialog / CpuOnly`, `e2e/settings.spec.ts` (fixed fake hardware) | real hardware on the mini PC |
| AC-7.1 Household accounts | `tests/test_auth.py`, `tests/test_visibility.py`, `e2e/accounts.spec.ts` | |
| AC-7.2 Admin keys | `tests/test_providers.py` (encrypted, never returned, not in logs), `e2e/settings.spec.ts` | |

The plan names `persistence.spec`, `upload.spec`, `navigation.spec` and others; the specs are grouped by area instead, see the table.

## 3. Hand checklist (section 11 of the plan)

Tick each line after two weeks of real use with real documents.

- [ ] AC-1.1 Upload a PDF, TXT, MD, DOCX, PPTX, HTML and EPUB at once; all reach "Bereit". A scan and a `.exe` fail with a clear German message.
- [ ] AC-1.2 At least 13 of 15 real addresses (`eval/urls/run.py`) give clean text; a failure offers "Text einfügen".
- [ ] AC-1.3 Uploads and imports appear without a save step; the same file or address again says "Bereits in deiner Bibliothek".
- [ ] AC-1.4 Documents are still there after logout, a browser restart, `make down` / `make up`, and on a phone.
- [ ] AC-2.1 A document of someone else (shared) can be summarised; the text streams in and is still there after a reload.
- [ ] AC-2.2 All five lengths land within 20 percent of the target (or show the "Quelle ist kurz" note).
- [ ] AC-2.3 Report in `docs/eval/summaries-*.md`: coverage at least 80 percent, summaries without unsupported claims at least 90 percent.
- [ ] AC-3.1 Input at the bottom, streaming, Markdown, copy, stop and regenerate work.
- [ ] AC-3.2 Documents can be searched and chosen before and during a chat; answers use only those.
- [ ] AC-3.3 Report in `docs/eval/rag-*.md`: at least 85 percent correct; "nicht gefunden" appears for questions outside the documents.
- [ ] AC-4.1 Reload while an answer streams: the question and the partial answer are still there.
- [ ] AC-4.2 A misspelt word finds the chat in under 300 ms; the result opens at the message.
- [ ] AC-5.1 Sidebar visible from 1024 px, drawer below; check on phone, tablet and desktop.
- [ ] AC-5.2 One click between Neuer Chat, Bibliothek, Einstellungen and any chat; typed text is kept.
- [ ] AC-5.3 Chats are grouped by date and can be resumed, renamed and deleted.
- [ ] AC-6.1 "Einstellungen" has model, summary language and account (and the admin sections for the admin).
- [ ] AC-6.2 Each person picks Ollama, Anthropic, Google or OpenAI models from the admin's providers.
- [ ] AC-6.3 On the mini PC: the warning shows the real RAM and GPU numbers; "Trotzdem verwenden" and "Abbrechen" behave as described.
- [ ] AC-7.1 A second person cannot see or open your private documents and chats; shared documents are read-only for them.
- [ ] AC-7.2 Only the admin sees "Anbieter"; no API key is ever shown again; `docker compose logs` contains no key.

## 4. Release

When every box is ticked and two full automated runs are green: tag `v1.0.0` yourself (`git tag v1.0.0`). The tag is deliberately not created by the agent.
