"""Generate 4 synthetic summary test documents whose key points are known by construction.

    cd apps/api && uv run python ../../eval/summaries/make_synthetic.py

Writes the files to eval/summaries/docs/ and prints manifest entries. The real test set needs 10
documents (German and English, 2 to 200 pages: article, report, slides, e-book chapter) with 5 to 12
hand-written key points each: add your own files to eval/summaries/docs/ and entries to manifest.yaml.
"""

from pathlib import Path

import pymupdf
from docx import Document
from ebooklib import epub
from pptx import Presentation

OUT = Path(__file__).parent / "docs"
OUT.mkdir(exist_ok=True)

FILLER = (
    "Die Beteiligten sprachen außerdem über organisatorische Einzelheiten, die für das Ergebnis keine "
    "weitere Rolle spielten, und verwiesen auf frühere Unterlagen. "
)

# 1. German article (docx)
facts_de = [
    "Die Stadtwerke Linz haben 2025 insgesamt 41 Megawatt neue Photovoltaik-Leistung in Betrieb genommen.",
    "Der größte Einzelstandort ist die Anlage auf dem Gelände des Hafens mit 12 Megawatt.",
    "Der Strompreis für Haushaltskunden sinkt zum 1. Jänner 2026 um 6 Prozent.",
    "Für Fernwärme erhöht sich der Grundpreis dagegen um 3 Prozent.",
    "Bis 2030 sollen 70 Prozent des Stroms aus erneuerbaren Quellen stammen.",
    "Ein Batteriespeicher mit 20 Megawattstunden soll im Sommer 2026 fertig werden.",
    "Die Investitionssumme für alle Maßnahmen beträgt rund 185 Millionen Euro.",
]
doc = Document()
doc.add_heading("Stadtwerke Linz: Ausbau der Erneuerbaren", 0)
for fact in facts_de:
    doc.add_paragraph(fact + " " + FILLER * 6)
doc.save(OUT / "artikel-stadtwerke.docx")

# 2. English report (pdf, 6 pages)
facts_en = [
    "Revenue grew by 14 percent to 320 million euros in fiscal 2025.",
    "The wind segment contributed 40 percent of total revenue.",
    "Operating margin improved from 9 percent to 12 percent.",
    "The company hired 210 new engineers, mostly in the storage division.",
    "A new factory in Graz will start production in March 2026.",
    "The board proposes a dividend of 1.20 euros per share.",
    "Main risks are supply chain delays for transformers and rising interest rates.",
    "The outlook for 2026 expects revenue growth of 8 to 10 percent.",
]
pdf = pymupdf.open()
for i in range(6):
    page = pdf.new_page()
    text = (facts_en[i] if i < len(facts_en) else "") + " " + " ".join(["The management discussed routine operational matters in detail."] * 30)
    if i == 5:
        text = " ".join(facts_en[5:]) + " " + text
    page.insert_textbox(pymupdf.Rect(60, 60, 540, 780), text, fontsize=11)
pdf.set_metadata({"title": "Annual Report 2025 (synthetic)"})
pdf.save(OUT / "report-annual.pdf")

# 3. German slides (pptx)
slide_facts = [
    "Das Projekt Alpenblick startet im April 2026 und dauert 18 Monate.",
    "Das Budget beträgt 2,4 Millionen Euro, davon 40 Prozent Fördermittel.",
    "Das Team besteht aus 9 Personen an drei Standorten.",
    "Meilenstein 1 ist der Prototyp im Juli 2026.",
    "Hauptrisiko ist die Verfügbarkeit von Sensoren; Lieferzeit derzeit 14 Wochen.",
    "Die Abnahme durch den Kunden ist für Oktober 2027 geplant.",
]
prs = Presentation()
for n, fact in enumerate(slide_facts, start=1):
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = f"Projekt Alpenblick {n}"
    slide.placeholders[1].text = fact + " " + FILLER * 2
prs.save(OUT / "folien-alpenblick.pptx")

# 4. English e-book chapter (epub)
chapter_facts = [
    "Captain Marsh reaches the island of Tern on the third of May.",
    "He discovers that the lighthouse keeper has been missing for two weeks.",
    "A logbook shows that the lamp was lit every night until the eleventh of April.",
    "Marsh finds a sealed letter addressed to his sister in the keeper's desk.",
    "The village doctor claims the keeper left by boat, but the boat is still in the harbour.",
    "At the end of the chapter Marsh decides to stay until the supply ship returns.",
]
book = epub.EpubBook()
book.set_identifier("synthetic-1")
book.set_title("The Lamp on Tern (synthetic)")
book.set_language("en")
chapter = epub.EpubHtml(title="Chapter 1", file_name="ch1.xhtml", lang="en")
chapter.content = "<h1>Chapter 1</h1>" + "".join(f"<p>{f} The wind carried salt across the grey water and nobody spoke for a while.</p>" for f in chapter_facts)
book.add_item(chapter)
book.toc = (chapter,)
book.spine = ["nav", chapter]
book.add_item(epub.EpubNcx())
book.add_item(epub.EpubNav())
epub.write_epub(str(OUT / "chapter-tern.epub"), book)
print("written:", sorted(p.name for p in OUT.iterdir()))
