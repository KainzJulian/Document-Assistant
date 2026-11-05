# W9.2 Edge-case checklist (20 cases)

Go through the list by hand, tick each, and log failures in `docs/test-log.md`. "Handled" says what the code does; "Gap" names a known limit.

| # | Case | How to test | Expected | In code |
| --- | --- | --- | --- | --- |
| 1 | Encrypted PDF | Upload a password-protected PDF | Status Fehler: "Passwortgeschützte PDFs werden nicht unterstützt." | Handled (`extract_pdf`) |
| 2 | 0-byte file | Upload an empty file | Rejected: "Die Datei ist leer." | Handled |
| 3 | File over 50 MB | Upload a 51 MB file | Rejected: "Die Datei ist größer als 50 MB." | Handled |
| 4 | Scanned PDF | Upload a PDF made from a photo | Fehler: "Gescannte PDFs werden nicht unterstützt." | Handled |
| 5 | Wrong extension | Rename a text file to `.pdf` and upload | Rejected as unsupported (checked by content) | Handled |
| 6 | Same file twice at once | Select the same file twice in one upload | One document, the other says "Bereits in deiner Bibliothek" | Handled (unique constraint caught) |
| 7 | Document deleted while a chat uses it | Delete a document that an open chat uses, then ask | Chat keeps its messages; the question uses the remaining documents, or says to choose a document; old citations show "Dokument gelöscht" | Handled |
| 8 | Provider key revoked | Revoke or change the key at the provider, ask a question | Answer area shows "Der API-Schlüssel wurde abgelehnt oder fehlt."; the question stays saved | Handled |
| 9 | Provider rate limit | Send many questions quickly with a low-limit key | "Der Anbieter ist gerade überlastet (Rate-Limit)..." | Handled; Gap: one automatic retry only for non-streamed calls (summaries parts, titles), not for the first token of a stream |
| 10 | Ollama down mid-answer | Stop the Ollama container during an answer | Text so far stays, error "Der Anbieter ist nicht erreichbar." | Handled |
| 11 | Two tabs streaming at once | Ask in two tabs of the same chat | Both stream; both answers are saved | Handled (separate streams) |
| 12 | Session expiry during upload | Delete the session row in the database, then upload | Redirect to the login page | Handled (401 callback in the upload helper) |
| 13 | Corrupt DOCX | Upload a ZIP with `word/document.xml` that is not XML | Fehler: "Das Dokument konnte nicht gelesen werden." | Handled (generic catch) |
| 14 | Huge web page | Import a page over 10 MB | "Die Seite ist größer als 10 MB." | Handled |
| 15 | Slow web page | Import a URL that hangs | "Die Seite hat nicht rechtzeitig geantwortet (15 Sekunden)." | Handled |
| 16 | Internal address | Import `http://localhost:8000` | "Diese Adresse darf nicht abgerufen werden." | Handled; Gap: DNS rebinding not covered |
| 17 | Empty question | Send a question with only spaces | Nothing is sent (button disabled); API answers 422 "Bitte gib eine Frage ein." | Handled |
| 18 | Embedding provider down during upload | Stop Ollama, upload a document | Fehler: "Das Indexieren ist fehlgeschlagen: ..."; "Erneut versuchen" works after Ollama is back | Handled |
| 19 | Disk full | Fill the files volume, upload | Rejected: "Auf dem Server ist nicht genug Speicherplatz frei." | Handled |
| 20 | Server restart during indexing | `docker compose restart worker` while a document is "Wird indexiert" | Document stays in that status until the job is retried by the worker or via "Erneut versuchen" | Gap: a job killed mid-run is picked up again by Procrastinate only if the worker was marked stale; use "Erneut verarbeiten" otherwise |
