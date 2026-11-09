"""Check every sample against its expected title, page count and word count.

Run from the repository root:
    cd backend && uv run python eval/extraction/run.py
Word counts may differ by 15 percent (menus, markers, table syntax).
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parents[1]))

from app.services.extractors import extract, word_count  # noqa: E402
from app.services.filetypes import detect_kind  # noqa: E402

failures = 0
for item in json.loads((HERE / "expected.json").read_text(encoding="utf-8")):
    path = HERE / "samples" / item["file"]
    problems: list[str] = []
    kind = detect_kind(path.read_bytes(), path.name)
    if kind != item["kind"]:
        problems.append(f"kind {kind} != {item['kind']}")
    else:
        result = extract(kind, path)
        words = word_count(result.markdown)
        if (result.title or "").strip() != item["title"]:
            problems.append(f"title {result.title!r} != {item['title']!r}")
        if result.page_count != item["page_count"]:
            problems.append(f"pages {result.page_count} != {item['page_count']}")
        if abs(words - item["words"]) > 0.15 * item["words"]:
            problems.append(f"words {words} vs expected {item['words']}")
        for noise in ("Cookies", "Impressum", "Kontakt"):
            if noise in result.markdown:
                problems.append(f"page furniture leaked: {noise}")
    failures += bool(problems)
    print(("FAIL " if problems else "PASS ") + item["file"] + ("  " + "; ".join(problems) if problems else ""))
print(f"\n{14 - failures}/14 samples extract with the expected values")
sys.exit(1 if failures else 0)
