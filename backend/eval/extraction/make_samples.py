"""Generate the 14 extraction samples (2 per format) and expected.json.

Run from the repository root:
    cd backend && uv run python eval/extraction/make_samples.py
The files are committed; rerun only when the sample content should change.
"""

import json
from pathlib import Path

import pymupdf
from docx import Document
from ebooklib import epub
from pptx import Presentation

OUT = Path(__file__).parent / "samples"
OUT.mkdir(exist_ok=True)

DE = (
    "Der Mieter kann das Mietverhältnis unter Einhaltung einer Frist von drei Monaten zum "
    "Monatsletzten schriftlich kündigen. Maßgeblich ist der Zugang der Kündigung beim Vermieter. "
    "Eine vorzeitige Auflösung des Vertrages ist nur mit Zustimmung beider Parteien möglich, "
    "wenn die Wohnung verkauft wird oder wichtige Gründe vorliegen."
)
EN = (
    "The annual report describes the energy produced by the company during the last year. "
    "Solar plants delivered most of the growth, while wind parks stayed stable. The board expects "
    "further investments in storage systems and a higher share of renewable energy in the grid."
)
expected: list[dict[str, object]] = []


def words(*texts: str) -> int:
    """Count the words of the given texts."""
    return sum(len(t.split()) for t in texts)


def add(file: str, kind: str, title: str, pages: int | None, count: int) -> None:
    """Record the expected values of one sample."""
    expected.append({"file": file, "kind": kind, "title": title, "page_count": pages, "words": count})


# PDF: 3 pages German, 5 pages English
for name, text, title, pages in (("bericht-de.pdf", DE, "Mietvertrag Wohnung Linz", 3), ("report-en.pdf", EN, "Annual Report Energy", 5)):
    doc = pymupdf.open()
    for _ in range(pages):
        page = doc.new_page()
        page.insert_textbox(pymupdf.Rect(60, 60, 540, 780), (text + " ") * 4, fontsize=11)
    doc.set_metadata({"title": title})
    doc.save(OUT / name)
    add(name, "pdf", title, pages, words(text) * 4 * pages)

# DOCX
d = Document()
d.add_heading("Garantiebedingungen Geschirrspüler", 0)
d.add_heading("Allgemeines", 1)
for _ in range(3):
    d.add_paragraph(DE)
t = d.add_table(rows=2, cols=2)
for i, cell in enumerate(("Gerät", "Garantie", "Geschirrspüler", "24 Monate")):
    t.cell(i // 2, i % 2).text = cell
d.save(OUT / "garantie.docx")
add("garantie.docx", "docx", "Garantiebedingungen Geschirrspüler", None, words("Garantiebedingungen Geschirrspüler Allgemeines", DE * 3) + 4)
d = Document()
d.add_heading("Meeting Notes", 0)
d.add_paragraph("Agenda", style="List Bullet")
d.add_paragraph(EN)
d.add_paragraph(EN)
d.save(OUT / "notes-en.docx")
add("notes-en.docx", "docx", "Meeting Notes", None, words("Meeting Notes Agenda", EN * 2))

# PPTX
for name, title, slides in (("kurs-de.pptx", "Italienisch A2", 3), ("deck-en.pptx", "Energy Overview", 5)):
    prs = Presentation()
    total = 0
    for i in range(slides):
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        slide.shapes.title.text = title if i == 0 else f"Slide {i + 1}"
        slide.placeholders[1].text = EN
        slide.notes_slide.notes_text_frame.text = "Notes for the speaker"
        total += words(title if i == 0 else f"Slide {i + 1}", EN, "Notes for the speaker") + 3
    prs.save(OUT / name)
    add(name, "pptx", title, slides, total)

# HTML (with navigation and cookie banner that must not appear in the text)
for name, title, text in (("artikel-de.html", "Photovoltaik im Überblick", DE), ("article-en.html", "Energy Storage Basics", EN)):
    # NOTE: trafilatura drops exact duplicate paragraphs, so every paragraph is made unique.
    body = "".join(f"<p>Abschnitt {i}: {text}</p>" for i in range(1, 5))
    html = (
        f"<!doctype html><html><head><title>{title}</title></head><body>"
        "<nav><a href='/'>Start</a> <a href='/x'>Kontakt</a></nav>"
        "<div class='cookie-banner'>Wir verwenden Cookies. Akzeptieren</div>"
        f"<article><h1>{title}</h1>{body}</article><footer>Impressum 2026</footer></body></html>"
    )
    (OUT / name).write_text(html, encoding="utf-8")
    add(name, "html", title, None, words(title) + (words(text) + 2) * 4)

# EPUB
for name, title, text in (("buch-de.epub", "Das kleine Mietrecht", DE), ("book-en.epub", "Energy Handbook", EN)):
    book = epub.EpubBook()
    book.set_identifier(name)
    book.set_title(title)
    book.set_language("de" if text is DE else "en")
    chapters = []
    for n in (1, 2):
        ch = epub.EpubHtml(title=f"Kapitel {n}", file_name=f"ch{n}.xhtml", lang="de")
        ch.content = f"<h1>Kapitel {n}</h1>" + "".join(f"<p>{text}</p>" for _ in range(3))
        book.add_item(ch)
        chapters.append(ch)
    book.toc = tuple(chapters)
    book.spine = ["nav", *chapters]
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    epub.write_epub(str(OUT / name), book)
    add(name, "epub", title, None, 2 * (2 + words(text) * 3))

# TXT and Markdown
(OUT / "notiz-de.txt").write_text("Einkaufsliste und Notizen\n\n" + DE + "\n" + DE + "\n", encoding="utf-8")
add("notiz-de.txt", "txt", "Einkaufsliste und Notizen", None, words("Einkaufsliste und Notizen", DE * 2))
(OUT / "log-en.txt").write_text("Weekly log\n\n" + EN + "\n", encoding="utf-8")
add("log-en.txt", "txt", "Weekly log", None, words("Weekly log", EN))
(OUT / "readme-de.md").write_text("# Projektnotizen\n\n## Ziel\n\n" + DE + "\n\n## Plan\n\n- " + EN + "\n", encoding="utf-8")
add("readme-de.md", "md", "Projektnotizen", None, words("# Projektnotizen ## Ziel", DE, "## Plan -", EN))
(OUT / "guide-en.md").write_text("# User Guide\n\n" + EN + "\n\n" + EN + "\n", encoding="utf-8")
add("guide-en.md", "md", "User Guide", None, words("# User Guide", EN * 2))

(OUT.parent / "expected.json").write_text(json.dumps(expected, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"{len(expected)} samples written to {OUT}")
