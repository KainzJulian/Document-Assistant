"""Extractors without the database: helpers, text and HTML, and tiny files built on the fly."""

from pathlib import Path

import pymupdf
import pytest
from docx import Document as DocxDocument
from pptx import Presentation

from app.services.extractors import (
    EXTRACTORS,
    ExtractionError,
    _first_heading,
    _html_to_markdown,
    detect_language,
    extract,
    extract_html_string,
    word_count,
)

GERMAN = "Der Mieter kann das Mietverhältnis unter Einhaltung einer Frist von drei Monaten schriftlich kündigen und die Wohnung wird dann an den Vermieter zurückgegeben. " * 3
ENGLISH = "The tenant can end the lease with three months of notice and the flat is then handed back to the landlord who will check that it is in good condition. " * 3


def test_word_count_ignores_page_markers() -> None:
    assert word_count("<!--page:1-->\n\nzwei Wörter\n\n<!--page:2-->\n\ndrei weitere Wörter") == 5
    assert word_count("") == 0


def test_language_is_guessed_from_stop_words() -> None:
    assert detect_language(GERMAN) == "de"
    assert detect_language(ENGLISH) == "en"
    assert detect_language("Zu kurz.") is None
    assert detect_language("Foo bar baz qux " * 20) is None


def test_first_heading_is_the_first_hash_line() -> None:
    assert _first_heading("Vorspann\n\n## Kapitel Eins\n\n# Zwei") == "Kapitel Eins"
    assert _first_heading("kein Titel hier") is None


def test_text_files_keep_their_text_and_take_the_title_from_a_heading_or_the_first_line(tmp_path: Path) -> None:
    md = tmp_path / "a.md"
    md.write_text("Vorwort\n\n# Projektnotizen\n\nText", encoding="utf-8")
    assert extract("md", md).title == "Projektnotizen"
    txt = tmp_path / "b.txt"
    txt.write_text("\n\nErste Zeile\nZweite", encoding="utf-8")
    result = extract("txt", txt)
    assert result.title == "Erste Zeile" and result.extractor == "text"


def test_a_byte_order_mark_is_removed(tmp_path: Path) -> None:
    path = tmp_path / "bom.txt"
    path.write_bytes("﻿Ärger".encode("utf-8"))
    assert extract("txt", path).markdown == "Ärger"


def test_html_keeps_the_article_and_drops_the_page_furniture() -> None:
    html = (
        "<html><head><title>Wald im Herbst</title></head><body><nav>Start Kontakt</nav><article>"
        + "".join(f"<p>Absatz {i}: Im Herbst verfärben sich die Blätter vieler Laubbäume von Grün zu Gelb und Rot, weil der Baum den Blattfarbstoff abbaut.</p>" for i in range(8))
        + "</article><footer>Impressum und Datenschutz</footer></body></html>"
    )
    result = extract_html_string(html)
    assert "Laubbäume" in result.markdown and "Impressum" not in result.markdown
    assert result.title == "Wald im Herbst" and result.extractor == "trafilatura"


def test_html_without_text_is_a_german_error() -> None:
    with pytest.raises(ExtractionError) as error:
        extract_html_string("<html><body><div id='app'></div></body></html>")
    assert "kein Text" in str(error.value)


def test_epub_chapters_become_headings_paragraphs_and_list_items() -> None:
    markdown = _html_to_markdown("<html><body><h1>Kapitel 1</h1><p>Ein   Absatz\nmit Umbruch.</p><ul><li>Punkt</li></ul><p> </p></body></html>")
    assert markdown == "# Kapitel 1\n\nEin Absatz mit Umbruch.\n\n- Punkt"


def test_every_kind_has_an_extractor_and_an_unknown_kind_is_an_error(tmp_path: Path) -> None:
    assert {"pdf", "docx", "pptx", "epub", "html", "url", "text", "txt", "md"} <= set(EXTRACTORS)
    with pytest.raises(KeyError):
        extract("exe", tmp_path / "x")


def test_pdf_pages_get_markers_and_a_page_count(tmp_path: Path) -> None:
    pdf = pymupdf.open()
    for number in (1, 2):
        pdf.new_page().insert_text((72, 72), f"Seite {number} mit genug Text für die Erkennung des Inhalts dieser Seite.")
    path = tmp_path / "zwei.pdf"
    pdf.save(str(path))
    result = extract("pdf", path)
    assert result.page_count == 2 and "<!--page:1-->" in result.markdown and "<!--page:2-->" in result.markdown
    assert "Seite 2" in result.markdown


def test_docx_headings_lists_and_tables(tmp_path: Path) -> None:
    doc = DocxDocument()
    doc.add_heading("Garantiebedingungen", level=1)
    doc.add_paragraph("Die Garantie gilt zwei Jahre.")
    doc.add_paragraph("Punkt eins", style="List Bullet")
    table = doc.add_table(rows=2, cols=2)
    for row, cells in enumerate((("Teil", "Dauer"), ("Motor", "5 Jahre"))):
        for col, value in enumerate(cells):
            table.cell(row, col).text = value
    path = tmp_path / "garantie.docx"
    doc.save(str(path))
    result = extract("docx", path)
    assert result.title == "Garantiebedingungen"
    assert "# Garantiebedingungen" in result.markdown and "- Punkt eins" in result.markdown
    assert "| Teil | Dauer |" in result.markdown and "| Motor | 5 Jahre |" in result.markdown


def test_pptx_slides_are_pages_with_speaker_notes(tmp_path: Path) -> None:
    prs = Presentation()
    for number in (1, 2):
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        slide.shapes.title.text = f"Titel {number}"
        slide.placeholders[1].text = f"Inhalt {number}"
    prs.slides[0].notes_slide.notes_text_frame.text = "Nicht vergessen"
    path = tmp_path / "kurs.pptx"
    prs.save(str(path))
    result = extract("pptx", path)
    assert result.page_count == 2 and result.title == "Titel 1"
    assert "<!--page:2-->" in result.markdown and "## Folie 2: Titel 2" in result.markdown
    assert "Inhalt 1" in result.markdown and "Notizen: Nicht vergessen" in result.markdown
