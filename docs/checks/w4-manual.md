# W4 manual checks

Log results in `docs/test-log.md`.

## W4.2 Embedding jobs (mini PC)

1. Start Ollama (`docker compose -f docker-compose.yml --env-file .env --profile ollama up -d`) and `make ollama-pull` (bge-m3).
2. Settings, "Anbieter": add Ollama, "Verbindung testen". Section "Embedding-Modell": choose `bge-m3`, "Wechseln". Wait until it shows "Aktiv".
3. Create the big PDF: `cd backend && uv run python ../docs/checks/make-big-pdf.py big-200.pdf`. Upload it.
4. Watch the statuses in order: Wartet, Wird gelesen, Wird indexiert, Bereit, without reloading the page.
5. Note the time from upload to "Bereit" in `docs/test-log.md` (indexing time on CPU).

## W4.3 Embedding model switch

1. Add a cloud provider with an embedding model (OpenAI `text-embedding-3-small` or Google) and test the connection.
2. Switch from the local model to the cloud model; while the progress bar runs, ask retrieval questions (`/api/admin/retrieval-debug` or `backend/eval/rag/run_retrieval.py`): they keep working.
3. After "Aktiv", switch back to bge-m3. Questions keep working throughout.
4. The retired model's vectors are deleted after 7 days (the job `purge_retired_embeddings` runs nightly at 03:17).

## W4.4 Retrieval quality

1. Upload your own documents; write 20 questions into `backend/eval/rag/questions.yaml` (format in the file).
2. `docker cp backend/eval/rag doc-assistant-api-1:/tmp/rag` then `docker exec -i doc-assistant-api-1 python - < backend/eval/rag/run_retrieval.py`.
3. Target: at least 18 of 20 questions have the expected passage in the top 8.
