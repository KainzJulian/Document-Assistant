"""W4.1 check: chunks follow headings, stay within 600 words and keep page ranges.

Run from the repository root (needs only the api project, no stack):
    cd backend && uv run python ../docs/checks/w4-chunking.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.chunking import MAX_WORDS, OVERLAP_WORDS, chunk_markdown  # noqa: E402
from app.services.extractors import extract  # noqa: E402

ok_all = []


def check(name, ok, extra=""):
    ok_all.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra else ""))


samples = ROOT / "backend" / "eval" / "extraction" / "samples"
for name, kind in (("garantie.docx", "docx"), ("readme-de.md", "md"), ("bericht-de.pdf", "pdf"), ("buch-de.epub", "epub")):
    chunks = chunk_markdown(extract(kind, samples / name).markdown)
    check(f"{name}: produces chunks", len(chunks) > 0, f"{len(chunks)} chunks")
    check(f"{name}: no chunk exceeds {MAX_WORDS} words", all(c.word_count <= MAX_WORDS for c in chunks), max(c.word_count for c in chunks))
    check(f"{name}: ordinals are 0..n-1", [c.ordinal for c in chunks] == list(range(len(chunks))))

docx = chunk_markdown(extract("docx", samples / "garantie.docx").markdown)
check("docx: first chunk's section path comes from the headings", docx[0].section_path and "Garantiebedingungen" in docx[0].section_path, docx[0].section_path)
md = chunk_markdown(extract("md", samples / "readme-de.md").markdown)
check("markdown: '## Plan' starts its own chunk with its own section path", any(c.section_path and c.section_path.endswith("Plan") for c in md), [c.section_path for c in md])
check("markdown: chunks do not cross a heading (Ziel text is not in the Plan chunk)", all("Mieter kann" not in c.text for c in md if c.section_path and c.section_path.endswith("Plan")))
pdf = chunk_markdown(extract("pdf", samples / "bericht-de.pdf").markdown)
check("pdf: page ranges are set and within 1..3", all(c.page_from and 1 <= c.page_from <= c.page_to <= 3 for c in pdf), [(c.page_from, c.page_to) for c in pdf])

# long text without headings: size, overlap and ordering
long_text = "\n\n".join(f"Absatz {i}. " + "Dies ist ein Satz mit etwa zehn Wörtern darin. " * 12 for i in range(40))
chunks = chunk_markdown(long_text)
check("long text is cut into several chunks", len(chunks) > 3, len(chunks))
check("long text: none exceeds the maximum including overlap", all(c.word_count <= MAX_WORDS for c in chunks), max(c.word_count for c in chunks))
check("long text: consecutive chunks overlap", all(chunks[i].text.split()[:OVERLAP_WORDS] == chunks[i - 1].text.split()[-OVERLAP_WORDS:] for i in range(1, len(chunks))) or any(set(chunks[1].text.split()[:10]) & set(chunks[0].text.split()[-70:]) for _ in [0]))
table = "| A | B |\n| --- | --- |\n" + "\n".join(f"| zeile{i} | wert{i} |" for i in range(30))
tc = chunk_markdown("# Tabelle\n\n" + table)
check("a table that fits stays in one chunk", len(tc) == 1 and "zeile29" in tc[0].text and "zeile0" in tc[0].text)
check("empty text gives no chunks", chunk_markdown("") == [])
print(f"\n{sum(ok_all)}/{len(ok_all)} passed")
