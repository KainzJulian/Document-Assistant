"""W8.2 RAG evaluation: retrieval hit rate, answer correctness, citation correctness, "not found" accuracy.

Targets: at least 85 percent of answers correct, at least 90 percent of citations support their sentence,
and every unanswerable question gets the fixed "not found" sentence.

    docker cp eval doc-assistant-api-1:/tmp/eval
    docker exec -e JUDGE_PROVIDER="<label>" -e JUDGE_MODEL="<model>" doc-assistant-api-1 python /tmp/eval/run_rag.py
    docker cp doc-assistant-api-1:/tmp/eval/out/. docs/eval/
"""

import re
from pathlib import Path

import yaml
from common import NOT_FOUND, client, judge, sse, write_report

HERE = Path(__file__).parent
ANSWER_SYSTEM = (
    'Du bist ein strenger Prüfer. Antworte nur mit JSON {"correct": true|false}. correct ist true, wenn die ANTWORT '
    "inhaltlich zur ERWARTETEN ANTWORT passt (kleine Formulierungsunterschiede sind erlaubt, falsche Zahlen oder Fakten nicht)."
)
CITE_SYSTEM = (
    'Du bist ein strenger Prüfer. Antworte nur mit JSON {"supported": [true, false, ...]} mit einem Eintrag pro Paar, '
    "in derselben Reihenfolge: true, wenn die TEXTSTELLE die AUSSAGE belegt."
)

questions = yaml.safe_load((HERE / "rag" / "answers.yaml").read_text(encoding="utf-8"))
c = client()
titles = {d["title"]: d["id"] for d in c.get("/documents").json() if d["status"] == "ready"}
rows, hits, answerable, correct, unanswerable, not_found, pairs, supported = [], 0, 0, 0, 0, 0, 0, 0
for q in questions:
    missing = [t for t in q["documents"] if t not in titles]
    if missing:
        print(f"SKIP {q['id']}: documents not ready: {missing}")
        continue
    ids = [titles[t] for t in q["documents"]]
    chat = c.post("/chats", json={"document_ids": ids}).json()
    try:
        events = sse(c, f"/chats/{chat['id']}/messages", {"content": q["question"]})
        answer = "".join(d["text"] for e, d in events if e == "token").strip()
        cites = next((d for e, d in events if e == "citations"), [])
        if q.get("answerable", True):
            answerable += 1
            top = c.get("/admin/retrieval-debug", params={"q": q["question"], "document_ids": ids}).json()
            hit = any(q["expect_passage"].lower() in p["text"].lower() for p in top)
            ok = bool(judge(ANSWER_SYSTEM, f"FRAGE: {q['question']}\nERWARTETE ANTWORT: {q['expected']}\nANTWORT: {answer}").get("correct"))
            hits += hit
            correct += ok
            # citation support: each sentence with [n] against the cited passage
            texts = {cc["n"]: c.get(f"/chunks/{cc['chunk_id']}").json()["text"] for cc in cites}
            items = []
            for sentence in re.split(r"(?<=[.!?])\s+", answer):
                for n in {int(x) for x in re.findall(r"\[(\d+)\]", sentence)}:
                    if n in texts:
                        items.append((sentence, texts[n]))
            if items:
                body = "\n\n".join(f"PAAR {i}:\nAUSSAGE: {s}\nTEXTSTELLE: {t}" for i, (s, t) in enumerate(items, start=1))
                flags = judge(CITE_SYSTEM, body).get("supported", [])
                pairs += len(items)
                supported += sum(bool(f) for f in flags[: len(items)])
            rows.append(f"| {q['id']} | ja | {'Treffer' if hit else 'kein Treffer'} | {'richtig' if ok else 'falsch'} | {answer[:90]} |")
        else:
            unanswerable += 1
            ok = answer == NOT_FOUND
            not_found += ok
            rows.append(f"| {q['id']} | nein | - | {'korrekt (nicht gefunden)' if ok else 'FALSCH'} | {answer[:90]} |")
        print(rows[-1])
    finally:
        c.delete(f"/chats/{chat['id']}")

def pct(a: int, b: int) -> str:
    """Format a share as a percentage (n/a without data)."""
    return f"{(a / b):.0%}" if b else "n/a"


report = """# RAG evaluation

| Frage | Beantwortbar | Retrieval | Antwort | Antwort (gekürzt) |
| --- | --- | --- | --- | --- |
""" + "\n".join(rows) + f"""

## Result

- Retrieval hit rate (answerable): **{pct(hits, answerable)}**
- Answers correct: **{pct(correct, answerable)}** (target at least 85 percent)
- Citations that support their sentence: **{pct(supported, pairs)}** of {pairs} (target at least 90 percent)
- Unanswerable questions answered with "not found": **{not_found} of {unanswerable}** (target: all)
"""
print(f"\n{write_report('rag', report)}")
