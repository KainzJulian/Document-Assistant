"""Convert each supported format to Markdown with page or section markers.

Markers: a line ``<!--page:N-->`` starts page (or slide) N. Headings are ``#`` lines.
The chunker (W4) reads both.
"""

# pyright: basic
# NOTE: pymupdf, python-docx, python-pptx, ebooklib and trafilatura ship incomplete type hints;
# strict checking is relaxed for this module only.

import re
from dataclasses import dataclass
from pathlib import Path
from typing import cast

import pymupdf
import pymupdf4llm
import trafilatura
from docx import Document as DocxDocument
from docx.table import Table
from docx.text.paragraph import Paragraph
from ebooklib import ITEM_DOCUMENT, epub
from lxml import html as lxml_html
from pptx import Presentation

PAGE_MARKER = re.compile(r"^<!--page:(\d+)-->$", re.MULTILINE)
_STOP = {
    "de": set(
        """der die das und ist nicht ein eine zu den mit von für auf im dem des sich
        auch als an es werden aus er hat dass sie nach bei einer um am sind noch wie
        einem über einen so zum war haben nur oder aber vor zur bis mehr durch man
        sein wurde sei""".split()
    ),
    "en": set(
        """the and of to in is that it for as with was on are by this be at from or an
        have not but they which you were their has had one all there been would more
        when who will no if can""".split()
    ),
}


class ExtractionError(Exception):
    """A document cannot be read; the message is German and shown to the user."""


@dataclass
class ExtractionResult:
    """What an extractor returns.

    Attributes:
        markdown: Text with markers.
        extractor: Name and library used.
        title: Title found in the content, if any.
        page_count: Pages or slides, if the format has them.
    """

    markdown: str
    extractor: str
    title: str | None = None
    page_count: int | None = None


def word_count(markdown: str) -> int:
    """Count the words of a Markdown text, ignoring page markers."""
    return len(PAGE_MARKER.sub("", markdown).split())


def detect_language(text: str) -> str | None:
    """Guess German or English from stop word frequency.

    Args:
        text: Document text.

    Returns:
        ``de``, ``en`` or None if neither clearly wins.
    """
    words = re.findall(r"[a-zäöüß]+", text[:40000].lower())
    if len(words) < 20:
        return None
    scores = {lang: sum(w in stop for w in words) / len(words) for lang, stop in _STOP.items()}
    lang, best = max(scores.items(), key=lambda item: item[1])
    other = min(scores.values())
    return lang if best >= 0.12 and best > other * 1.5 else None


def _first_heading(markdown: str) -> str | None:
    """Return the text of the first ``#`` heading."""
    match = re.search(r"^#{1,3}\s+(.+)$", markdown, re.MULTILINE)
    return match.group(1).strip() if match else None


def _decode(data: bytes) -> str:
    """Decode text files (UTF-8, BOM allowed)."""
    return data.decode("utf-8-sig", errors="replace")


def extract_pdf(path: Path) -> ExtractionResult:
    """Extract a text PDF page by page.

    Raises:
        ExtractionError: For encrypted or scanned PDFs.
    """
    doc = pymupdf.open(path)  # type: ignore[no-untyped-call]
    if doc.needs_pass:
        raise ExtractionError("Passwortgeschützte PDFs werden nicht unterstützt.")
    pages = cast(list[dict[str, str]], pymupdf4llm.to_markdown(doc, page_chunks=True))
    parts = [f"<!--page:{i}-->\n\n{p['text'].strip()}" for i, p in enumerate(pages, start=1)]
    markdown = "\n\n".join(parts)
    count = len(pages)
    if word_count(markdown) < 10 * max(count, 1):
        raise ExtractionError("Gescannte PDFs werden nicht unterstützt.")
    title = (doc.metadata or {}).get("title") or _first_heading(markdown)
    return ExtractionResult(markdown, "pymupdf4llm", title, count)


def _table_markdown(table: Table) -> str:
    """Render a Word table as a Markdown table."""
    rows = [[c.text.strip().replace("\n", " ") for c in r.cells] for r in table.rows]
    if not rows:
        return ""
    lines = ["| " + " | ".join(rows[0]) + " |", "| " + " | ".join("---" for _ in rows[0]) + " |"]
    lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(lines)


def extract_docx(path: Path) -> ExtractionResult:
    """Extract a Word document; heading styles become ``#`` headings."""
    doc = DocxDocument(str(path))
    blocks: list[str] = []
    for item in doc.iter_inner_content():
        if isinstance(item, Table):
            blocks.append(_table_markdown(item))
            continue
        assert isinstance(item, Paragraph)
        text = item.text.strip()
        if not text:
            continue
        style = (item.style.name if item.style is not None else "") or ""
        if style == "Title":
            blocks.append(f"# {text}")
        elif style.startswith("Heading "):
            level = int(style.split()[-1]) if style.split()[-1].isdigit() else 1
            blocks.append(f"{'#' * min(level, 6)} {text}")
        elif "List" in style:
            blocks.append(f"- {text}")
        else:
            blocks.append(text)
    markdown = "\n\n".join(blocks)
    return ExtractionResult(
        markdown, "python-docx", _first_heading(markdown) or doc.core_properties.title or None
    )


def extract_pptx(path: Path) -> ExtractionResult:
    """Extract a presentation: one section per slide, speaker notes included."""
    prs = Presentation(str(path))
    parts: list[str] = []
    for i, slide in enumerate(prs.slides, start=1):
        title = slide.shapes.title.text.strip() if slide.shapes.title is not None else ""
        lines = [f"<!--page:{i}-->", f"## Folie {i}" + (f": {title}" if title else "")]
        for shape in slide.shapes:
            if shape.has_text_frame and shape != slide.shapes.title:
                frame = getattr(shape, "text_frame")  # noqa: B009
                lines += [p.text.strip() for p in frame.paragraphs if p.text.strip()]
            if getattr(shape, "has_table", False):
                for row in getattr(shape, "table").rows:  # noqa: B009
                    lines.append(" | ".join(c.text.strip() for c in row.cells))
        notes = slide.notes_slide.notes_text_frame if slide.has_notes_slide else None
        if notes is not None and notes.text.strip():
            lines.append("Notizen: " + notes.text.strip())
        parts.append("\n\n".join(lines))
    markdown = "\n\n".join(parts)
    first = (
        prs.slides[0].shapes.title.text.strip()
        if prs.slides and prs.slides[0].shapes.title is not None
        else None
    )
    return ExtractionResult(
        markdown, "python-pptx", first or prs.core_properties.title or None, len(prs.slides)
    )


def _html_to_markdown(content: bytes | str) -> str:
    """Small HTML to Markdown converter for EPUB chapters (headings, paragraphs, list items)."""
    root = lxml_html.fromstring(content.encode("utf-8") if isinstance(content, str) else content)
    lines: list[str] = []
    for el in root.iter("h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote"):
        text = " ".join(el.text_content().split())
        if not text:
            continue
        if el.tag.startswith("h"):
            lines.append(f"{'#' * int(el.tag[1])} {text}")
        elif el.tag == "li":
            lines.append(f"- {text}")
        else:
            lines.append(text)
    return "\n\n".join(lines)


def extract_epub(path: Path) -> ExtractionResult:
    """Extract an e-book; every chapter file is one section."""
    book = epub.read_epub(str(path), options={"ignore_ncx": True})
    chapters = [
        _html_to_markdown(item.get_content()) for item in book.get_items_of_type(ITEM_DOCUMENT)
    ]
    markdown = "\n\n".join(c for c in chapters if c.strip())
    meta = book.get_metadata("DC", "title")
    title = meta[0][0] if meta else None
    return ExtractionResult(markdown, "ebooklib", title or _first_heading(markdown))


def extract_html(path: Path) -> ExtractionResult:
    """Extract the main text of an HTML file (menus and banners dropped).

    Raises:
        ExtractionError: If no main text is found.
    """
    html = _decode(path.read_bytes())
    markdown = trafilatura.extract(
        html, output_format="markdown", include_tables=True, include_links=False
    )
    if not markdown:
        raise ExtractionError("In dieser Datei wurde kein Text gefunden.")
    meta = trafilatura.extract_metadata(html)
    return ExtractionResult(
        markdown, "trafilatura", (meta.title if meta else None) or _first_heading(markdown)
    )


def extract_text(path: Path) -> ExtractionResult:
    """Read a TXT or Markdown file as it is."""
    markdown = _decode(path.read_bytes())
    first_line = next((ln.strip() for ln in markdown.splitlines() if ln.strip()), None)
    return ExtractionResult(markdown, "text", _first_heading(markdown) or first_line)


EXTRACTORS = {
    "pdf": extract_pdf,
    "docx": extract_docx,
    "pptx": extract_pptx,
    "epub": extract_epub,
    "html": extract_html,
    "txt": extract_text,
    "md": extract_text,
}


def extract(kind: str, path: Path) -> ExtractionResult:
    """Extract a stored file.

    Args:
        kind: A kind key such as ``pdf``.
        path: Path of the file.

    Returns:
        The extraction result.

    Raises:
        ExtractionError: If the file cannot be read; the message is German.
    """
    return EXTRACTORS[kind](path)
