# Document Assistant – Implementation Plan

Nov 1, 2026 · @Julian

## 1. Overview

A German-language web app for your household that keeps a personal library of documents and web pages, summarises them in five lengths, and answers questions about selected documents in a chat, citing the passages it used. It runs on your home server (Angular + FastAPI + Postgres/pgvector) on home Wi-Fi. It is built in 11 waves (0–10), about 200 hours: 29 weeks at 7.5 h per week plus a 3-week buffer, starting whenever you choose.

### Scope

| Area         | In scope                                                                                                            | Out of scope                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Input        | Upload PDF (text-based), TXT, Markdown, DOCX, PPTX, HTML, EPUB; import a URL's main text                            | Scanned PDFs / images (OCR), JavaScript-only pages, paywalled pages |
| Library      | Automatic saving, per-person library, optional sharing with the household, duplicates detected                      | Folders, version history of documents                               |
| Summaries    | Five lengths with fixed word targets, saved per document and length, regenerate on demand                           | Summaries across several documents at once                          |
| Q&A          | Chat over one or more selected documents, streamed answers with numbered citations to page/section                  | Web search, answering from general knowledge without documents      |
| History      | Every chat saved automatically; keyword search over titles and messages                                             | Semantic search over chats                                          |
| Navigation   | Sidebar with new chat, library, chat list, search, settings                                                         | —                                                                   |
| AI           | Anthropic, OpenAI, Google (admin's keys) or Ollama; each person picks a model; embeddings model chosen by the admin | Fine-tuning, agents                                                 |
| Ollama check | Server RAM/GPU compared with the selected model's needs; warning with "Trotzdem verwenden" / "Abbrechen"            | —                                                                   |
| Users        | Household accounts (admin + members)                                                                                | Public sign-up                                                      |

### Decisions from the interview

| Topic             | Decision                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Platform          | Self-hosted web app on your home server; the Ollama check evaluates the server                                           |
| Users             | Household: own library and chats per person; documents can be shared with the household                                  |
| Access            | Home Wi-Fi only, plain HTTP                                                                                              |
| Stack             | Angular + FastAPI + Postgres with pgvector                                                                               |
| Q&A               | Retrieval with citations (chunks + embeddings + keyword search)                                                          |
| File types        | PDF, TXT, Markdown, DOCX, PPTX, HTML, EPUB                                                                               |
| Embeddings        | Configurable by the admin (local Ollama or cloud); a switch re-indexes in the background                                 |
| Summary lengths   | Extra Short \~50, Short \~150, Medium \~300, Long \~600, Extra Long \~1,200 words; never more than a third of the source |
| Saved summaries   | Stored with the document, one per length, with the model that made it                                                    |
| Chat search       | Keyword search, typo-tolerant, German + English                                                                          |
| Settings          | Admin stores provider keys; each person chooses provider and model                                                       |
| Hardware check    | Compared against the selected Ollama model's memory need                                                                 |
| Language          | German UI                                                                                                                |
| Engineering rules | Docstrings everywhere, atomic design + Storybook, type-safe Python, automated tests in the final wave                    |
| Timing            | Not fixed; the timeline counts weeks from your start                                                                     |

### Timeline

Waves in weeks from the start at 7.5 h per week, with a 3-week buffer.

&#91;embedded content: timeline · 11 waves + 3-week buffer\]

The app becomes useful for real questions after W5 (week 17); summaries follow in W7, and W8 proves their quality before the feature freeze.

## 2. Clarifications to the criteria

Seven of your criteria needed a concrete meaning before they could be built and tested. Section 11 uses these meanings.

| Criterion                     | Open point                                             | How the plan reads it                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ollama hardware warning (6)   | A browser cannot see a computer's RAM or GPU           | The check runs on the server where Ollama runs, and compares free RAM and GPU memory with the selected model's need (section 5)                                                                                           |
| Accurate output (2)           | "Accurately reflects the key points" is not measurable | A fixed test set of 10 documents with hand-written key points. A summary passes if it covers ≥ 80% of them (Medium and longer) and contains no claim the source doesn't support. Checked by a scripted evaluation in W8   |
| Summary of long documents (2) | Long documents don't fit into a model's context        | Documents above the model's budget are summarised in parts, then combined to the target length (section 4)                                                                                                                |
| Interactive Q&A (3)           | "Context-aware answers"                                | Answers use only the selected documents, cite passages as \[1\], \[2\] with document and page/section, and say clearly when the documents don't contain the answer. Follow-up questions see the earlier turns of the chat |
| URL import (1)                | Some pages can't be extracted                          | Main-text extraction for normal pages; pages that need JavaScript or a login fail with a clear message and offer "Text einfügen"                                                                                          |
| Search / Q&A section (5)      | The name is ambiguous                                  | "Neuer Chat" is the Q&A start page (choose documents, ask); chat search sits at the top of the chat list in the sidebar                                                                                                   |
| Persistent library (1)        | Across sessions and devices                            | Documents live on the server and are available after login on any device at home, until the owner deletes them                                                                                                            |

## 3. Architecture and stack

Five containers run as their own Compose project on the mini PC that hosts the recipe app, served on a second port: `http://192.168.1.50:8080`. Ollama is shared with the recipe app if its `ai-local` profile is running; otherwise this project starts its own.

&#91;embedded content: architecture · 5 services on the mini PC\]

The api and the worker share Postgres and Ollama; jobs pass through the Postgres queue, so no extra broker is needed.

### Components

| Service        | Tech                                 | Responsibility                                                                                       |
| -------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `proxy`        | Caddy 2, port 8080                   | Serves the Angular build; `/api/*` → `api`; long timeouts for streaming                              |
| `api`          | Python 3.12, FastAPI, Uvicorn        | Auth, documents, chats, summaries, settings, hardware check; streams answers with Server-Sent Events |
| `worker`       | Same code base, Procrastinate worker | Background jobs: text extraction, chunking, embeddings, re-indexing, long summaries                  |
| `db`           | Postgres 16 + pgvector               | All data, vectors, full-text indexes and the job queue                                               |
| `ollama`       | Ollama (shared or own)               | Local chat models and local embeddings                                                               |
| Volume `files` | Disk                                 | Original uploaded files, stored as `<owner>/<document_id>/<filename>`                                |

The cloud providers (Anthropic, OpenAI, Google) are called directly from `api` and `worker` with the admin's keys. No document text leaves the server unless a cloud provider is chosen for that step.

### Stack

Pin exact versions in W0 and record them in `docs/versions.md`.

| Layer              | Choice                                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend           | Angular (newest major supported by Storybook, checked in the W0 spike), standalone + signals, Tailwind CSS 4, `ngx-markdown` for rendering answers                          |
| Component workshop | Storybook with autodocs from TSDoc and the a11y addon                                                                                                                       |
| Frontend rules     | ESLint + `eslint-plugin-jsdoc` (TSDoc required), no `any`, atomic-layer import rules, TS strict                                                                             |
| Backend            | FastAPI, Pydantic v2 strict, SQLAlchemy 2 typed ORM + Alembic, psycopg 3, Procrastinate (Postgres job queue), `argon2-cffi`, `cryptography` (Fernet for API keys), `psutil` |
| Extraction         | `pymupdf4llm` (PDF → Markdown with page numbers), `python-docx`, `python-pptx`, `trafilatura` (HTML and URLs), `ebooklib` (EPUB), `httpx`                                   |
| AI SDKs            | `anthropic`, `openai`, `google-genai` and `ollama` official Python clients behind one typed provider interface; `tiktoken`-style token estimates per provider               |
| Retrieval          | pgvector HNSW index (cosine) + Postgres full-text search, combined with reciprocal rank fusion                                                                              |
| Backend rules      | `mypy --strict` + `pyright` strict; ruff `D` (Google style) and `ANN` (no `Any`)                                                                                            |
| Tests (W10)        | pytest, Vitest, Storybook interaction tests, Playwright                                                                                                                     |

### Repository layout

```
doc-assistant/
├─ apps/web/src/app/
│  ├─ core/            auth, api client, SSE client, i18n (de.ts), guards
│  ├─ domain/          pure TS: citation parsing, length options, formatting
│  ├─ state/           signal stores: session, library, chats, active-chat, settings
│  ├─ ui/{atoms,molecules,organisms,templates}/
│  └─ pages/           login, new-chat, chat, library, document, settings, admin
├─ apps/api/app/
│  ├─ routers/         auth, users, documents, summaries, chats, settings, hardware, admin
│  ├─ services/        extraction, chunking, embeddings, retrieval, answering, summarising, hardware
│  ├─ providers/       base protocol + anthropic, openai, google, ollama adapters
│  ├─ jobs/            Procrastinate tasks
│  ├─ models/          Pydantic models; db/ SQLAlchemy models
│  └─ prompts/         German prompt templates
├─ eval/              test documents, key points, questions, evaluation scripts
├─ infra/             docker-compose.yml, Caddyfile, .env.example, scripts/
└─ docs/
```

The engineering rules match the earlier plans: presentational atoms to organisms, only pages use stores, a story for every component, lint fails on missing docstrings or `any` / `Any`, and every task's Check is done by hand and logged until W10.

## 4. Pipelines

Every document goes through one ingestion pipeline before it can be summarised or questioned. Chat answers and summaries then read from what that pipeline produced.

&#91;embedded content: pipeline · ingestion and question flow\]

### 4.1 Ingestion

- **Upload:** file type checked by content, not just extension; max 50 MB. The SHA-256 hash catches a duplicate in the owner's library ("Bereits in deiner Bibliothek" with a link). The original is stored on the `files` volume, and the document row starts with status `queued`.
- **URL import:** the URL is normalised (tracking parameters and `#fragments` removed) and checked for duplicates. It is fetched with a 15 s timeout and 10 MB cap. `trafilatura` extracts the main text plus title, author, date and site. Under 200 extracted words counts as a failure with the offer "Text einfügen". The raw HTML is kept so the text can be re-extracted later.
- **Extraction job:** converts the file to Markdown with page markers (PDF, PPTX slides) or heading structure (DOCX, HTML, EPUB), then detects the language. A PDF with almost no text gets "Gescannte PDFs werden nicht unterstützt".
- **Status chip** in the library: Wartet → Wird gelesen → Wird indexiert → Bereit, or Fehler with the reason and "Erneut versuchen".

### 4.2 Chunking and embeddings

- **Chunking:** split by headings, then paragraphs. Target 400 words, maximum 600, with a 60-word overlap. Each chunk keeps its section path ("Kapitel 2 › Methoden") and page range. Tables stay whole when they fit.
- **Embeddings:** the admin's active embedding model, in batches of 32. Default: a multilingual local model through Ollama (e.g. bge-m3, 1024 dimensions). Alternatives: OpenAI or Google embedding models.
- **Switching models:** the new model gets status `building` while a job embeds every chunk; the old one keeps answering. When done, the switch is atomic, and old vectors are deleted after 7 days. The admin page shows progress.

### 4.3 Retrieval for a question

1. **Stand-alone question:** from the second message on, the last 4 turns are used to rewrite the question so it makes sense alone ("und im zweiten Kapitel?" → "Was sagt Kapitel 2 über …?").
2. **Vector search:** top 30 chunks by cosine similarity, restricted to the chat's selected documents.
3. **Keyword search:** top 30 chunks by Postgres full-text rank (language-neutral `simple` config + `unaccent`), same restriction.
4. **Fusion:** reciprocal rank fusion (k = 60), keep the top 8, up to 6,000 tokens. A neighbouring chunk from the same section is added when it fits, so passages aren't cut mid-thought.

### 4.4 Answering

- The prompt (German) lists the passages as \[1\]…\[8\] with document title and page/section. It tells the model to use only those passages, cite every statement, answer in the question's language, and reply "Dazu finde ich in den ausgewählten Dokumenten nichts." when they don't contain the answer.
- The answer streams token by token over Server-Sent Events (works over plain HTTP). When finished, the message is saved with its citations (number → chunk, document, page) and token usage.
- In the chat, citations are chips. Tapping one opens the passage in a side panel with the document title and page.

### 4.5 Summaries

- **Target words:** Extra Short 50, Short 150, Medium 300, Long 600, Extra Long 1,200, but never more than a third of the source's words. When capped, a note says "Quelle ist kurz – auf N Wörter begrenzt". Lengths outside ± 20% of the target get one rewrite pass.
- **Short sources** (≤ 60% of the chosen model's context): one call with instructions to put key points first, add nothing that isn't in the source, and keep the document's language. A switch "Auf Deutsch" translates the summary.
- **Long sources:** chunks are grouped into parts of about 3,000 words, each part is summarised in proportion to its size, then the part summaries are combined to the target length. Progress shows "Teil 3 von 7".
- The result streams in and is saved per document and length with the model name and date. "Neu erstellen" replaces it.

## 5. Ollama hardware check

The check runs on the server every time someone selects an Ollama model in settings, and when the admin selects an Ollama embedding model. It compares what the server has free with what the chosen model needs, and maps the result to one of four verdicts.

### What is measured

- **RAM:** total and available memory from `psutil` (the container reads the host's `/proc/meminfo`). If the Ollama container has a memory limit, the lower value counts.
- **GPU:** `infra/scripts/detect-gpu.sh` runs at setup and with `make hw-refresh`. It reads `nvidia-smi` or `rocm-smi` (name, total and free VRAM) or records "keine GPU", and writes `hardware.json`, mounted read-only into `api`. After a model has loaded, Ollama's `/api/ps` (`size_vram`) confirms whether it really runs on the GPU.
- **Model need:** from Ollama's `/api/show` and `/api/tags`: file size, parameter count and quantisation.

```latex
\mathrm{need_{GB}} = 1.15 \times \mathrm{file_{GB}} + 0.5 \times \frac{\mathrm{context}}{8192} \times \frac{\mathrm{params_B}}{8}
```

### Verdicts

| Verdict       | Rule                                                  | Message (German UI)                                           |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| Passt         | free VRAM ≥ need                                      | Green chip "Passt", no dialog                                 |
| Teilweise GPU | 0 < free VRAM < need, and free VRAM + free RAM ≥ need | "Läuft teilweise auf der GPU – Antworten langsamer"           |
| Nur CPU       | no GPU, free RAM ≥ need                               | "Keine GPU – Antworten sehr langsam (geschätzt \~N Wörter/s)" |
| Passt nicht   | free VRAM + free RAM < need                           | "Zu wenig Speicher – das Modell startet wahrscheinlich nicht" |

The speed estimate uses memory bandwidth ÷ model size, with a configurable bandwidth constant (default 20 GB/s for a dual-channel DDR4 mini PC). A "Geschwindigkeit testen" button runs a 20-second generation and shows the measured value instead.

### Dialog

- For every verdict except "Passt", a dialog shows: server RAM (total/free), GPU (name and VRAM, or "keine GPU"), the model's estimated need, the verdict, and the speed estimate.
- **"Trotzdem verwenden"** saves the model and the acknowledgement (person, model, verdict, date). **"Abbrechen"** keeps the previous model.
- The dialog appears again only if the verdict for that model gets worse (e.g. after a hardware change), or after `make hw-refresh` shows less free memory.
- If Ollama is unreachable, its models can't be selected and settings show "Ollama nicht erreichbar".
- Chats using a model with a warning show a small amber chip in the chat header.

### What to expect on your mini PC

With 16 GB RAM and no GPU: an 8B model at 4-bit (\~5 GB) gets "Nur CPU" at roughly 3–5 words per second; a 14B model (\~9 GB) also gets "Nur CPU" and is slower; a 32B model (\~20 GB) gets "Passt nicht".

## 6. Data model

The app has 14 tables in Postgres, plus Procrastinate's own job tables. Every row that belongs to a person carries `owner_id`, and every query filters by it in one shared repository layer, so one person can't reach another's data by accident.

| Table                     | Columns                                                                                                                                                                                                                                                     | Notes                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `users`                   | `id uuid pk`, `username citext unique`, `display_name`, `password_hash`, `role` (`admin` / `member`), `disabled bool`, `created_at`                                                                                                                         | Created by the admin; no sign-up                                                                       |
| `sessions`                | `id` (hash of a random token), `user_id`, `created_at`, `expires_at`, `last_seen_at`                                                                                                                                                                        | HttpOnly cookie, `SameSite=Strict`, 30 days sliding                                                    |
| `documents`               | `id uuid pk`, `owner_id`, `title`, `source_type` (`file` / `url` / `text`), `filename`, `mime`, `size_bytes`, `url`, `url_normalized`, `content_hash`, `language`, `page_count`, `word_count`, `status`, `error`, `shared bool`, `created_at`, `updated_at` | Unique (`owner_id`, `content_hash`) and (`owner_id`, `url_normalized`)                                 |
| `document_texts`          | `document_id pk`, `markdown text`, `extractor`, `extracted_at`                                                                                                                                                                                              | Kept separate so the library list stays light                                                          |
| `chunks`                  | `id uuid pk`, `document_id`, `ordinal`, `section_path`, `page_from`, `page_to`, `text`, `word_count`, `tsv tsvector generated` (`simple` + `unaccent`)                                                                                                      | GIN index on `tsv`                                                                                     |
| `embedding_models`        | `id`, `provider`, `model`, `dims`, `status` (`building` / `active` / `retired`), `progress`, `created_at`                                                                                                                                                   | Exactly one `active`                                                                                   |
| `chunk_embeddings`        | `chunk_id`, `model_id`, `embedding vector`                                                                                                                                                                                                                  | Composite pk; one HNSW cosine index per model, created by the re-index job with the model's dimensions |
| `summaries`               | `id`, `document_id`, `length` (`xs` / `s` / `m` / `l` / `xl`), `text`, `word_count`, `target_words`, `provider`, `model`, `created_by`, `created_at`                                                                                                        | Unique (`document_id`, `length`)                                                                       |
| `chats`                   | `id uuid pk`, `owner_id`, `title`, `provider`, `model`, `created_at`, `updated_at`                                                                                                                                                                          | Title generated after the first answer, editable                                                       |
| `chat_documents`          | `chat_id`, `document_id`                                                                                                                                                                                                                                    | Selected sources; can change during a chat                                                             |
| `messages`                | `id uuid pk`, `chat_id`, `role` (`user` / `assistant`), `content`, `citations jsonb`, `provider`, `model`, `tokens_in`, `tokens_out`, `created_at`, `tsv tsvector generated`                                                                                | GIN on `tsv`; trigram index on `content` for typo tolerance                                            |
| `providers`               | `id`, `kind` (`anthropic` / `openai` / `google` / `ollama`), `label`, `base_url`, `api_key_enc`, `enabled`, `models jsonb` (cached model list)                                                                                                              | Admin only; keys encrypted with a Fernet key from `.env`                                               |
| `user_settings`           | `user_id pk`, `provider_id`, `model`, `summary_language` (`source` / `de`)                                                                                                                                                                                  |                                                                                                        |
| `ollama_acknowledgements` | `user_id`, `model`, `verdict`, `acknowledged_at`                                                                                                                                                                                                            | Lets the dialog re-appear only when the verdict gets worse                                             |

### Visibility rules

- A person sees their own documents plus documents others marked `shared`. Shared documents are read-only for others: they can be summarised and used in chats, but not renamed or deleted.
- Summaries belong to the document, so everyone who sees a shared document sees its summaries.
- Chats and messages are always private to their owner.
- Deleting a document removes its file, text, chunks, vectors and summaries. Chats that used it keep their messages, and their citations show "Dokument gelöscht".

## 7. API

All endpoints live under `/api` and need a session cookie, except login and health. State-changing requests also need the header `X-Requested-With: app` as CSRF protection alongside `SameSite=Strict`. Errors use `{"error": {"code", "message", "details"}}` with German messages.

| Area          | Endpoints                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth          | `POST /auth/login` {username, password} · `POST /auth/logout` · `GET /auth/me`                                                                                                                                                                                                                                                                                                                      |
| Users (admin) | `GET /users` · `POST /users` · `PATCH /users/{id}` (name, role, disabled, password reset)                                                                                                                                                                                                                                                                                                           |
| Documents     | `POST /documents/upload` (multipart, several files) · `POST /documents/url` {url} · `POST /documents/text` {title, text} · `GET /documents?q=&status=&shared=` · `GET /documents/{id}` · `GET /documents/{id}/text` · `GET /documents/{id}/file` · `PATCH /documents/{id}` (title, shared) · `DELETE /documents/{id}` · `POST /documents/{id}/retry` · `GET /documents/events` (SSE status updates) |
| Summaries     | `GET /documents/{id}/summaries` · `POST /documents/{id}/summaries` {length, language} → SSE stream (`progress`, `token`, `done`)                                                                                                                                                                                                                                                                    |
| Chats         | `GET /chats?q=` (keyword search with highlighted snippets) · `POST /chats` {document_ids} · `GET /chats/{id}` · `PATCH /chats/{id}` (title, document_ids) · `DELETE /chats/{id}`                                                                                                                                                                                                                    |
| Messages      | `POST /chats/{id}/messages` {content} → SSE stream (`token`, `citations`, `done`, `error`) · `POST /chats/{id}/messages/{mid}/regenerate` · `GET /chunks/{id}` (passage for the citation panel)                                                                                                                                                                                                     |
| Settings      | `GET /settings` · `PUT /settings` {provider_id, model, summary_language} · `GET /providers/{id}/models`                                                                                                                                                                                                                                                                                             |
| Hardware      | `GET /hardware/ollama-fit?model=` → {ram, gpu, need_gb, verdict, est_words_per_s} · `POST /hardware/ollama-benchmark` {model} · `POST /settings/ollama-ack` {model, verdict}                                                                                                                                                                                                                        |
| Admin         | `GET/POST/PATCH/DELETE /admin/providers` (keys write-only) · `POST /admin/providers/{id}/test` · `GET /admin/embedding-models` · `POST /admin/embedding-models` {provider, model} (starts re-index)                                                                                                                                                                                                 |
| Health        | `GET /health` {db, worker, ollama, providers}                                                                                                                                                                                                                                                                                                                                                       |

The OpenAPI schema generates the TypeScript client types (`openapi-typescript`), so frontend and backend share one contract. Streaming endpoints document their event types as Pydantic models too.

## 8. Waves 0–3: foundation, library, URLs, AI settings

Same task format as the earlier plans: ID, owner (**You** / **Agent**), steps, and a **Check** done by hand and logged in `docs/test-log.md` until W10. Hours are your time at 7.5 h per week.

### Wave 0 — Foundation (≈ 20 h, weeks 1–3)

Goal: a login-protected app shell with the sidebar, running on the mini PC.

1. **W0.1 Server project** (You)
   - New Compose project `doc-assistant` with `proxy` on port 8080, `api`, `worker`, `db` (Postgres 16 + pgvector). Allow 8080 from the LAN in `ufw`. Decide whether to share the recipe app's Ollama or start one here.
   - Check: `http://192.168.1.50:8080/api/health` answers from a phone on Wi-Fi.
2. **W0.2 Compatibility spike** (Agent, 1 day)
   - Newest Angular major that Storybook supports cleanly with Tailwind 4; recorded in `docs/adr/0001-versions.md`.
3. **W0.3 Monorepo and quality gates** (Agent)
   - Layout from section 3; lint, docstring and type rules; `make check` = lint + types + Storybook build.
   - Check: removing a docstring or adding `any` / `Any` fails `make check`.
4. **W0.4 Database baseline** (Agent)
   - Alembic baseline with extensions `vector`, `unaccent`, `pg_trgm`, `citext`; the tables from section 6 (with `COMMENT ON`); Procrastinate schema; the worker container starts and runs a no-op job.
   - Check: migrations apply to an empty DB twice; a test job runs.
5. **W0.5 Accounts** (Agent)
   - Login with username + password (argon2), server-side sessions in an HttpOnly cookie, CSRF header, 5 failed logins per 15 minutes lock that account for 15 minutes. `make create-admin` creates the first admin. Admin page: create users, reset passwords, disable users.
   - Check: by hand, admin creates a member; the member logs in on a phone and stays logged in after closing the browser.
6. **W0.6 App shell and sidebar** (Agent)
   - Template `app-shell`: sidebar fixed at 280 px on screens ≥ 1024 px and collapsible; a drawer with a menu button on smaller screens. Sidebar order: "Neuer Chat", "Bibliothek", chat search field, chat list (placeholder until W6), "Einstellungen" and the user menu at the bottom.
   - Atoms and molecules (button, icon, input, textarea, chip, badge, spinner, menu, dialog, toast, empty state) with stories in light/dark and phone width. German strings in `core/i18n/de.ts`.
   - Check: all stories render; the sidebar works on desktop, tablet and phone widths.
7. **W0.7 Ops basics** (Agent + You)
   - `backup.sh` (`pg_dump` + tar of the `files` volume), `restore.sh`, `update.sh`, `docs/setup.md`.
   - Check: a backup restores onto a fresh database with all files.

**Exit criteria W0:** two household accounts can log in from different devices; the sidebar shell works on all widths; `make check` is green.

### Wave 1 — Library and file ingestion (≈ 22 h, weeks 4–6)

Goal: upload files of all seven types and find them again, extracted and ready, in your library.

1. **W1.1 Upload and storage** (Agent)
   - `POST /documents/upload` for several files at once; type check by content; 50 MB limit; SHA-256 duplicate check per owner; file stored on the volume; document row `queued`; extraction job enqueued.
   - Check: by hand, uploading the same PDF twice shows "Bereits in deiner Bibliothek".
2. **W1.2 Extractors** (Agent)
   - One typed extractor per format returning Markdown plus page or section markers: PDF (`pymupdf4llm`), DOCX, PPTX (one section per slide, speaker notes included), HTML (`trafilatura`), EPUB (chapters as sections), TXT and Markdown. Language detection. Near-empty PDFs fail as "gescannt".
   - `eval/extraction/` holds 2 sample files per format with expected first heading, page count and word count.
   - Check: all 14 samples extract with the expected values.
3. **W1.3 Status events** (Agent)
   - Job status changes are pushed to the owner over `GET /documents/events` (SSE), so the library updates live.
   - Check: by hand, a 200-page PDF shows each status in turn without reloading.
4. **W1.4 Library page** (Agent)
   - List with title, type icon, source, size, date, status chip, "Geteilt" badge. Title search, filters (status, type, mine / shared with me). Drag-and-drop or picker upload for several files; per-file progress.
   - Check: by hand, upload 5 mixed files in one go; all reach "Bereit".
5. **W1.5 Document page** (Agent)
   - Metadata, extracted text with page markers, download original, rename, "Mit Haushalt teilen" toggle, delete (confirm), "Erneut verarbeiten". Summaries tab (filled in W7). "Chat mit diesem Dokument" button.
   - Check: by hand, a shared document appears read-only in the second account's library.

**Exit criteria W1:** AC-1.1, AC-1.3, AC-1.4 and AC-7.1 pass (chunks and embeddings come in W4).

### Wave 2 — URL import (≈ 10 h, weeks 7–8)

Goal: paste a link, get the article's clean text into the library.

1. **W2.1 Fetch and extract** (Agent)
   - `POST /documents/url`: normalise, de-duplicate, fetch (15 s, 10 MB, browser user agent), `trafilatura` main text + metadata, ≥ 200 words or a clear error, raw HTML kept.
   - `POST /documents/text` stores pasted text as a document.
2. **W2.2 Import UI** (Agent)
   - "URL importieren" in the library and on "Neuer Chat"; on failure, a dialog offers "Text einfügen".
3. **W2.3 URL sample set** (You pick, Agent records)
   - 15 URLs: news sites, blogs, Wikipedia (DE/EN), documentation pages, one JavaScript-only page, one paywalled page.
   - Check: ≥ 13 of the 15 extract cleanly (no menus, cookie banners or comment sections in the text); the JavaScript and paywall pages fail with the right message.

**Exit criteria W2:** AC-1.2 passes.

### Wave 3 — AI providers, settings and the Ollama check (≈ 18 h, weeks 9–11)

Goal: the admin configures providers, everyone picks a model, and choosing a too-big Ollama model triggers the warning.

1. **W3.1 Provider layer** (Agent)
   - One typed protocol: `stream_chat`, `complete`, `embed`, `list_models`, `context_window`, `count_tokens`. Adapters for Anthropic, OpenAI, Google and Ollama with timeouts, one retry on rate limits, and errors mapped to German messages.
   - Check: by hand, a test prompt streams from each configured provider.
2. **W3.2 Admin providers page** (Agent)
   - Add, edit, disable providers. Keys are write-only ("gespeichert" shown, never the key) and encrypted at rest. "Verbindung testen". Model lists refreshed from each provider's API and cached.
   - Check: by hand, the key never appears in any API response or log.
3. **W3.3 Settings page** (Agent)
   - Clear "Einstellungen" section in the sidebar: AI model picker grouped "Lokal (Ollama)" and "Cloud" with provider labels; summary language ("wie die Quelle" / "Deutsch"); account (display name, password). Admins also see the provider and embedding sections.
   - Check: by hand, two accounts keep different models.
4. **W3.4 Hardware service** (Agent + You)
   - `detect-gpu.sh`, `hardware.json`, live RAM via `psutil`, model need and verdict from section 5, benchmark endpoint.
   - Check: on the mini PC, an 8B model gets "Nur CPU" and a 32B model gets "Passt nicht"; the benchmark's measured speed is logged.
5. **W3.5 Warning dialog** (Agent)
   - Organism `ollama-fit-dialog` with all four verdict variants in Storybook; "Trotzdem verwenden" stores the acknowledgement, "Abbrechen" restores the previous choice; re-prompt only when the verdict gets worse; amber chip in chats.
   - Check: by hand, all verdicts and both buttons.

**Exit criteria W3:** AC-6.1, AC-6.2, AC-6.3 and AC-7.2 pass.

## 9. Waves 4–7: retrieval, chat, history, summaries

### Wave 4 — Indexing and retrieval (≈ 22 h, weeks 12–14)

Goal: every document is chunked and embedded, and a question finds the right passages within the selected documents.

1. **W4.1 Chunking** (Agent)
   - Chunker from section 4.2, run after extraction; section path and page range on every chunk; generated `tsv` column.
   - Check: for 3 sample documents, chunks follow headings and none exceeds 600 words.
2. **W4.2 Embedding jobs** (Agent)
   - Embed new chunks in batches of 32 with the active model; status "Wird indexiert" with progress. Default model set up by `make ollama-pull`.
   - Check: a 200-page PDF is fully indexed on the mini PC; indexing time is logged.
3. **W4.3 Embedding model switch** (Agent)
   - Admin page "Embedding-Modell": pick provider + model; a re-index job builds the new vectors and its HNSW index while the old model keeps serving; atomic switch; retired vectors deleted after 7 days.
   - Check: by hand, switch from local to a cloud model and back; questions keep working throughout.
4. **W4.4 Hybrid retrieval** (Agent)
   - `services/retrieval.py`: vector top 30 + keyword top 30, restricted to the given document ids and the person's visibility; RRF; top 8 within 6,000 tokens; neighbour chunk.
   - Debug endpoint (admin only) shows the ranked passages for a question.
   - Check: for 20 questions in `eval/rag/questions.yaml` written by you, the expected passage is in the top 8 for at least 18.

**Exit criteria W4:** retrieval reaches 18 / 20 on your question set.

### Wave 5 — Chat and Q&A (≈ 22 h, weeks 15–17)

Goal: a chatbot that answers from the selected documents, with citations, and saves every conversation.

1. **W5.1 "Neuer Chat" page** (Agent)
   - Centred input like a standard chatbot. Above it, a document picker: searchable list of your and shared documents with checkboxes, "Alle auswählen", selected documents shown as removable chips. Only documents with status "Bereit" can be selected. Sending the first message creates the chat.
   - Check: by hand, select 3 documents and start a chat.
2. **W5.2 Answer streaming** (Agent)
   - `POST /chats/{id}/messages` runs the stand-alone rewrite, retrieval and the answer prompt from section 4.4 with the person's chosen model, streaming tokens over SSE. The user message and the full answer are saved as they happen, so an interrupted answer keeps what arrived (marked "abgebrochen").
   - Check: by hand, answers start appearing within 3 s with a cloud model; reloading mid-answer keeps both messages.
3. **W5.3 Chat page** (Agent)
   - Message list with Markdown rendering, citation chips \[1\] \[2\] opening a side panel (document, page, passage, "Dokument öffnen"), copy button, "Neu generieren", "Stopp" while streaming. Header: chat title, the model in use, the selected documents (editable during the chat).
   - Check: by hand, every citation chip opens the passage that supports the sentence.
4. **W5.4 Follow-ups and "not found"** (Agent)
   - Follow-up questions use the last 4 turns; questions outside the documents get the fixed "not found" sentence, not an invented answer.
   - Check: 5 follow-up questions and 5 off-topic questions from your question set behave as described.
5. **W5.5 Chat titles** (Agent)
   - After the first answer, a short German title is generated with the person's model (fallback: first 6 words of the question); editable.

**Exit criteria W5:** AC-3.1, AC-3.2, AC-3.3 and AC-4.1 pass.

### Wave 6 — Sidebar chat list and search (≈ 14 h, weeks 18–19)

Goal: every past chat is one click away and findable by keyword.

1. **W6.1 Chat list** (Agent)
   - In the sidebar, grouped as Heute, Gestern, Letzte 7 Tage, Älter; newest first; the active chat highlighted. Per chat: rename, delete (confirm). Selecting a chat resumes it with its documents and model.
   - Check: by hand, switch between "Neuer Chat", the library and three chats without losing any input you typed.
2. **W6.2 Keyword search** (Agent)
   - Search field above the chat list: full-text over titles and messages, typo-tolerant via trigram similarity, results with highlighted snippets; Enter or a click opens the chat scrolled to the matching message.
   - Check: with 100 seeded chats, a search answers in < 300 ms; a misspelt word ("Zusamenfassung") still finds the chat.

**Exit criteria W6:** AC-4.2, AC-5.1, AC-5.2 and AC-5.3 pass.

### Wave 7 — Summaries (≈ 16 h, weeks 20–21)

Goal: any document can be summarised in five lengths, and summaries are kept.

1. **W7.1 Summary service** (Agent)
   - Section 4.5: target words, the third-of-source cap, single-call or part-by-part path depending on the model's context, ± 20% check with one rewrite, source language or German.
   - Check: one long (> 150 pages) and one short document summarise in every length within tolerance.
2. **W7.2 Summary UI** (Agent)
   - On the document page and from a library row: a segmented control "Extra kurz · Kurz · Mittel · Lang · Extra lang" with the word target under each option, then "Zusammenfassen". Streaming with "Teil 3 von 7" progress for long documents. Saved summaries show their model and date, plus "Neu erstellen", "Kopieren" and "Als Chat fortsetzen" (starts a chat with this document).
   - Check: by hand, all five lengths for one document; reopening shows the saved ones instantly.

**Exit criteria W7:** AC-2.1 and AC-2.2 pass; AC-2.3 is measured in W8.

## 10. Waves 8–10: quality, hardening, tests

### Wave 8 — Quality evaluation (≈ 14 h, weeks 22–23)

Goal: summary accuracy and answer quality are measured, not assumed.

1. **W8.1 Test sets** (You + Agent)
   - `eval/summaries/`: 10 documents (German and English; 2-page to 200-page; article, report, slides, e-book chapter), each with 5–12 hand-written key points.
   - `eval/rag/`: your 20 retrieval questions from W4 plus 20 answer questions with expected answers and source passages, including 5 the documents can't answer.
2. **W8.2 Evaluation scripts** (Agent)
   - `eval/run_summaries.py`: generates all 5 lengths per document with a chosen model, then a judge model (a strong cloud model) checks key-point coverage and flags any claim not supported by the source. Results go to a dated Markdown report.
   - `eval/run_rag.py`: retrieval hit rate, answer correctness, citation correctness (does the cited passage support the sentence) and "not found" accuracy.
3. **W8.3 Tuning** (Agent + You)
   - Adjust prompts, chunk size and retrieval settings until the targets are met with your main cloud model, then record how the default local model scores.
   - Targets: Medium, Long and Extra Long cover ≥ 80% of key points; ≥ 90% of all summaries have no unsupported claim; ≥ 85% of answers correct; ≥ 90% of citations support their sentence; all 5 unanswerable questions get "not found".

**Exit criteria W8:** AC-2.3 passes with the targets above, and the report is stored in `docs/eval/`.

### Wave 9 — Hardening and documentation (≈ 12 h, weeks 24–25)

Goal: robust, fast and documented. Feature freeze at the end.

1. **W9.1 Performance** (Agent)
   - Library with 1,000 documents loads in < 1 s; chat list with 500 chats and search < 300 ms; first answer token < 3 s with a cloud model; the UI stays responsive while the worker indexes.
2. **W9.2 Edge cases** (Agent)
   - Checklist of 20 cases, including: encrypted PDF, 0-byte file, 50 MB limit, a document deleted while a chat uses it, provider key revoked, provider rate limit, Ollama down mid-answer, two tabs streaming at once, session expiry during upload.
3. **W9.3 Accessibility** (Agent)
   - Storybook a11y addon clean; keyboard-only flow through upload → chat → search; streamed answers announced to screen readers politely, not per token.
4. **W9.4 Documentation** (Agent, You review)
   - Zero docstring findings; generated reference docs (pdoc, Compodoc); German user guide plus in-app "Hilfe": supported files, limits, how citations work, what the Ollama warning means, privacy (which steps send text to cloud providers).

**Exit criteria W9:** performance targets met; zero lint findings; user guide reviewed.

### Wave 10 — Automated tests and final acceptance (≈ 30 h, weeks 26–29)

Goal: every Check becomes an automated test, bugs found are fixed, v1.0 ships. About 40% of this wave is reserved for fixes.

1. **W10.1 Test infrastructure** (Agent)
   - pytest with a disposable Postgres + pgvector; a fake provider that streams recorded answers; Vitest; Storybook interaction tests; Playwright; `make test` joins `make check`.
2. **W10.2 Backend tests** (Agent)
   - Extractors (all 14 samples), URL extraction (recorded pages), chunker, retrieval ranking on a fixed corpus, summary length logic and cap, hardware verdicts for 8 hardware/model combinations, auth and visibility rules (one person can never read another's data), streaming events. Target ≥ 85% coverage.
3. **W10.3 Frontend tests** (Agent)
   - `domain/` (citation parsing, length options) ≥ 90%; stores; play functions for the document picker, citation chip + panel, length selector, sidebar chat list, search results and the Ollama dialog.
4. **W10.4 End-to-end** (Agent)
   - One Playwright spec per acceptance criterion in section 11, with the fake provider and fake hardware readings.
5. **W10.5 Fix loop** (You + Agent)
   - Fix, re-run, then the whole suite twice in a row.
6. **W10.6 Final acceptance** (You)
   - Two weeks of household use with real documents; section 11 checklist by hand; re-run the W8 evaluation; tag `v1.0.0`.

**Exit criteria W10 (= project done):** all tests green twice in a row, coverage targets met, evaluation targets still met, and every criterion in section 11 passes.

## 11. Acceptance criteria

The app is done when all 20 criteria pass. AC-1.1 to AC-6.3 are your criteria in your order, made measurable; AC-7.1 and AC-7.2 cover the household decisions. Automated tests in the last column are written in W10.

| AC                        | Done when                                                                                                                                                                                           | Built in   | Verified by                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| AC-1.1 File upload        | PDF, TXT, MD, DOCX, PPTX, HTML and EPUB up to 50 MB upload (several at once) and reach "Bereit"; unsupported or scanned files fail with a clear German message                                      | W1         | pytest extractors, Playwright `upload.spec`                                        |
| AC-1.2 URL import         | A URL becomes a document with clean main text, title and source; ≥ 13 of 15 sample URLs extract cleanly; failures offer "Text einfügen"                                                             | W2         | pytest on recorded pages, Playwright `url.spec`                                    |
| AC-1.3 Automatic saving   | Every upload and URL import appears in the library without a save step; duplicates are detected                                                                                                     | W1, W2     | Playwright `library.spec`                                                          |
| AC-1.4 Persistent library | Documents remain after logout, browser restart and server restart, on any household device, until deleted                                                                                           | W1         | Playwright `persistence.spec`, manual server restart                               |
| AC-2.1 Summary generation | Any ready document (own or shared) can be summarised; the result streams in and is saved                                                                                                            | W7         | Playwright `summary.spec`                                                          |
| AC-2.2 Length selection   | Five labelled lengths with word targets are chosen before generating; output lands within ± 20% of the target or the third-of-source cap                                                            | W7         | pytest length logic, Playwright                                                    |
| AC-2.3 Accurate output    | On the 10-document test set: ≥ 80% key-point coverage (Medium and longer) and ≥ 90% of summaries with no unsupported claim                                                                          | W8         | `eval/run_summaries.py` report                                                     |
| AC-3.1 Chatbot interface  | Familiar chat layout: input at the bottom, streaming answers, Markdown, copy, stop and regenerate                                                                                                   | W5         | Playwright `chat.spec`                                                             |
| AC-3.2 Document selection | One or more documents are chosen from a searchable list before or during a chat; answers only use those                                                                                             | W5         | pytest retrieval filter, Playwright                                                |
| AC-3.3 Interactive Q&A    | Answers cite passages, handle follow-ups, and say "nicht gefunden" when the documents lack the answer; ≥ 85% correct on the test set                                                                | W4, W5, W8 | `eval/run_rag.py`, Playwright                                                      |
| AC-4.1 Chat auto-save     | Every message is saved as it happens, including interrupted answers                                                                                                                                 | W5         | pytest, Playwright reload test                                                     |
| AC-4.2 Chat search        | Keyword search over titles and messages finds chats (typo-tolerant) in < 300 ms with 500 chats and opens them at the match                                                                          | W6         | pytest search, Playwright `search.spec`                                            |
| AC-5.1 Sidebar            | Always visible from 1024 px, a drawer below; works on phone, tablet and desktop                                                                                                                     | W0.6       | Storybook viewports, Playwright                                                    |
| AC-5.2 Section switching  | One click switches between Neuer Chat, Bibliothek, Einstellungen and any chat without losing typed input                                                                                            | W6.1       | Playwright `navigation.spec`                                                       |
| AC-5.3 Chat management    | Chats are listed by date, can be resumed, renamed and deleted                                                                                                                                       | W6.1       | Playwright                                                                         |
| AC-6.1 Settings area      | A clear "Einstellungen" section for model, summary language and account (plus admin sections)                                                                                                       | W3.3       | Playwright `settings.spec`                                                         |
| AC-6.2 Model choice       | Each person picks Ollama or a cloud model (Anthropic, Google, OpenAI) from the admin's configured providers                                                                                         | W3         | Playwright                                                                         |
| AC-6.3 Ollama warning     | Selecting an Ollama model evaluates server RAM/GPU against the model's need; for every verdict except "Passt" a warning shows the numbers, and "Trotzdem verwenden" / "Abbrechen" work as specified | W3.4, W3.5 | pytest 8 hardware combinations, Storybook play test, Playwright with fake readings |
| AC-7.1 Household accounts | Each person has their own library and chats; shared documents are visible read-only to others; nobody can open another person's private data                                                        | W0.5, W1.5 | pytest visibility rules, Playwright two-user spec                                  |
| AC-7.2 Admin keys         | Only the admin manages providers; keys are encrypted and never returned by the API or written to logs                                                                                               | W3.2       | pytest, log scan in W10                                                            |

## 12. Defaults and risks

### Defaults chosen

| Default                                                                                  | Where it matters | Alternative                                 |
| ---------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------- |
| Runs on the recipe app's mini PC at port 8080                                            | W0.1             | Separate host or hostname                   |
| Shares the recipe app's Ollama if running                                                | W0.1             | Own Ollama container                        |
| 50 MB upload limit; scanned PDFs rejected                                                | W1               | Larger limit; OCR as an extra wave (≈ 15 h) |
| `pymupdf4llm` for PDFs (AGPL licence, fine for private self-hosting, recorded in an ADR) | W1.2             | `pypdf` (MIT), weaker layout                |
| Chunks of 400 words, max 600, 60-word overlap                                            | W4.1             | Tuned in W8                                 |
| Default local embedding model bge-m3 (1024 dims)                                         | W4.2             | Any Ollama or cloud embedding model         |
| Top 8 passages, max 6,000 tokens; last 4 turns as chat memory                            | W4.4, W5         | Tuned in W8                                 |
| Summaries keep the source language unless "Deutsch" is chosen                            | W7               | Always German                               |
| Shared documents are read-only for others; summaries shared with them                    | W1.5             | Private summaries                           |
| Chats stay private, even when they use shared documents                                  | W5               | Shared chats                                |
| Session cookie 30 days, no `Secure` flag (plain HTTP on the LAN)                         | W0.5             | Tailscale + HTTPS later                     |
| Token usage stored per message, no price display                                         | W5               | Cost estimate per provider                  |
| Bandwidth constant 20 GB/s for the CPU speed estimate                                    | W3.4             | Measured via the benchmark button           |
| Judge model for evaluations: your strongest cloud model                                  | W8               | Manual review only                          |

### Risks

| Risk                                                           | Effect                                                                                            | Mitigation                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| CPU-only Ollama on the mini PC                                 | Local chat answers at a few words per second; local summaries of long documents take many minutes | The hardware warning says so up front; cloud models for heavy work; local embeddings are still fine   |
| Embedding a large library on CPU                               | First indexing of hundreds of documents takes hours                                               | Background jobs with progress; documents become usable one by one                                     |
| Cloud providers see document text                              | Privacy concern for personal files                                                                | Shown in settings and the user guide; local models available for everything                           |
| Extraction quality varies (complex PDFs, slides, odd websites) | Wrong or missing text, weaker answers                                                             | Text viewer shows exactly what was extracted; "Erneut verarbeiten"; "Text einfügen" for URLs          |
| Model answers despite missing information                      | Confident but wrong answers                                                                       | Strict prompt, mandatory citations, "not found" test questions in W8                                  |
| Plain HTTP on the LAN                                          | Passwords and API traffic to the server readable on your Wi-Fi                                    | Keys never leave the server; guest Wi-Fi separated; Tailscale is the easy upgrade                     |
| Provider APIs and model names change                           | Broken model lists or calls                                                                       | Model lists fetched live; adapters isolated per provider; the health page shows provider status       |
| Tests only in W10                                              | Bugs surface late                                                                                 | Evaluation scripts in W4 and W8 catch the quality problems early; 40% of W10 for fixes; 3-week buffer |
| Three projects at 5–10 h per week                              | Long overall timeline                                                                             | This plan is independent of the other two and can start whenever you choose                           |
