"""W8.2 summary evaluation: all 5 lengths per document, key-point coverage and unsupported claims.

Targets: Medium, Long and Extra Long cover at least 80 percent of the key points; at least 90 percent
of all summaries contain no unsupported claim.

    docker cp eval doc-assistant-api-1:/tmp/eval
    docker exec -e JUDGE_PROVIDER="<label>" -e JUDGE_MODEL="<model>" doc-assistant-api-1 python /tmp/eval/run_summaries.py
    docker cp doc-assistant-api-1:/tmp/eval/out/. docs/eval/
"""

from pathlib import Path

import yaml
from common import client, ensure_documents, judge, sse, write_report

HERE = Path(__file__).parent
LENGTHS = ["xs", "s", "m", "l", "xl"]
SYSTEM = (
    "Du bist ein strenger Prüfer für Zusammenfassungen. Antworte ausschließlich mit JSON im Format "
    '{"covered": [true, false, ...], "unsupported": ["..."]}. "covered" hat genau einen Eintrag pro Kernaussage, '
    "in derselben Reihenfolge: true, wenn die Zusammenfassung die Kernaussage inhaltlich enthält. "
    '"unsupported" listet Behauptungen der Zusammenfassung, die durch die Quelle nicht gestützt werden (leer, wenn es keine gibt).'
)

manifest = yaml.safe_load((HERE / "summaries" / "manifest.yaml").read_text(encoding="utf-8"))
c = client()
docs = ensure_documents(c, [HERE / "summaries" / "docs" / m["file"] for m in manifest])
rows, coverage_long, clean, total = [], [], 0, 0
for item in manifest:
    doc = docs[item["file"]]
    source = c.get(f"/documents/{doc['id']}/text").json()["markdown"][:300_000]
    points = item["key_points"]
    for length in LENGTHS:
        events = sse(c, f"/documents/{doc['id']}/summaries", {"length": length, "language": "source"})
        done = next((d["summary"] for e, d in events if e == "done"), None)
        if done is None:
            rows.append(f"| {item['file']} | {length} | - | - | - | FEHLER: {[d for e, d in events if e == 'error']} |")
            total += 1
            continue
        numbered = "\n".join(f"{i}. {p}" for i, p in enumerate(points, start=1))
        verdict = judge(SYSTEM, f"QUELLE:\n{source}\n\nZUSAMMENFASSUNG:\n{done['text']}\n\nKERNAUSSAGEN:\n{numbered}")
        covered = verdict.get("covered", [])
        share = sum(bool(x) for x in covered) / len(points) if points else 0.0
        unsupported = verdict.get("unsupported", [])
        total += 1
        clean += not unsupported
        if length in ("m", "l", "xl"):
            coverage_long.append(share)
        claims = "; ".join(unsupported)[:160]
        rows.append(f"| {item['file']} | {length} | {done['word_count']} / {done['target_words']} | {share:.0%} | {len(unsupported)} | {claims} |")
        print(rows[-1])

avg = sum(coverage_long) / len(coverage_long) if coverage_long else 0
no_claim = clean / total if total else 0
report = f"""# Summary evaluation

Model under test: the model chosen in the settings of the evaluation user. Judge: {__import__('os').environ.get('JUDGE_MODEL')}.

| Document | Length | Words / target | Key points covered | Unsupported claims | Details |
| --- | --- | --- | --- | --- | --- |
""" + "\n".join(rows) + f"""

## Result

- Average key-point coverage for Medium, Long and Extra Long: **{avg:.0%}** (target at least 80 percent): {'PASS' if avg >= 0.8 else 'BELOW TARGET'}
- Summaries without an unsupported claim: **{no_claim:.0%}** of {total} (target at least 90 percent): {'PASS' if no_claim >= 0.9 else 'BELOW TARGET'}
"""
print(f"\n{write_report('summaries', report)}\ncoverage {avg:.0%}, clean {no_claim:.0%}")
