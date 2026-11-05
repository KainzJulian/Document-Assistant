# Evaluation and tuning (W8)

Reports from `eval/run_summaries.py` and `eval/run_rag.py` are stored here (`summaries-YYYY-MM-DD.md`, `rag-YYYY-MM-DD.md`). No report exists yet: the scripts were written but not run (see the commands at the top of each script).

## Running

1. `cd apps/api && uv run python ../../eval/summaries/make_synthetic.py` creates 4 synthetic test documents; add your own so the set has 10 (German and English, 2 to 200 pages) and write 5 to 12 key points for each into `eval/summaries/manifest.yaml`.
2. Write 20 retrieval questions (`eval/rag/questions.yaml`) and 20 answer questions (`eval/rag/answers.yaml`, 5 unanswerable).
3. Choose the model to evaluate in the settings (as the evaluation user). Configure a strong model as the judge: set `JUDGE_PROVIDER` (the provider's label) and `JUDGE_MODEL`.
4. Run both scripts (commands in their headers), copy the reports into this folder.

## Targets

| Measure | Target |
| --- | --- |
| Medium, Long, Extra Long summaries: key points covered | at least 80 percent |
| Summaries without an unsupported claim | at least 90 percent |
| Answers correct | at least 85 percent |
| Citations that support their sentence | at least 90 percent |
| Unanswerable questions answered with "not found" | all |
| Retrieval: expected passage in top 8 | at least 18 of 20 |

## Where each knob lives (W8.3 tuning)

| What | Where |
| --- | --- |
| Answer prompt (rules, language, "not found" sentence) | `apps/api/app/services/answering.py`, `_SYSTEM` |
| Stand-alone question rewrite, title prompt | same file, `_REWRITE`, `_TITLE` |
| Number of previous turns | same file, `HISTORY_MESSAGES` (8 messages = 4 turns) |
| Summary prompt, tolerance, part size, context share | `apps/api/app/services/summarising.py`: `_SYSTEM`, `TOLERANCE`, `PART_WORDS`, `CONTEXT_SHARE` |
| Summary target words | same file, `TARGETS` (and the labels in `ui/molecules/length-select`) |
| Chunk size, maximum, overlap | `apps/api/app/services/chunking.py`: `TARGET_WORDS`, `MAX_WORDS`, `OVERLAP_WORDS` |
| Retrieval: candidates, passages kept, token budget, RRF constant | `apps/api/app/services/retrieval.py`: `TOP_K`, `KEEP`, `TOKEN_BUDGET`, `RRF_K` |
| HNSW search breadth | `retrieval._vector_search`, `hnsw.ef_search` |
| Embedding model | Settings, "Embedding-Modell" (changing it re-indexes) |

After a chunking change, run "Erneut verarbeiten" on the documents (or re-upload) so they are chunked again. Record the scores of your main cloud model and of the default local model in the report.
