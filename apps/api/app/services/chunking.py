"""Split extracted Markdown into retrieval chunks.

Target 400 words, maximum 600, 60 words of overlap inside a section. Chunks never cross a heading;
each keeps its section path ("Kapitel 2 › Methoden") and page range. Tables stay whole when they fit.
"""

import re
from dataclasses import dataclass

TARGET_WORDS = 400
MAX_WORDS = 600
OVERLAP_WORDS = 60
# A block must leave room for the overlap so a chunk never exceeds MAX_WORDS in total.
PIECE_MAX = MAX_WORDS - OVERLAP_WORDS

_PAGE = re.compile(r"^<!--page:(\d+)-->$")
_HEADING = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")


@dataclass
class ChunkData:
    """One chunk ready to be stored.

    Attributes:
        ordinal: Position in the document, starting at 0.
        section_path: Headings above the chunk, joined with " › ", or None.
        page_from: First page (or slide) the chunk touches.
        page_to: Last page (or slide) the chunk touches.
        text: The chunk text.
        word_count: Number of words.
    """

    ordinal: int
    section_path: str | None
    page_from: int | None
    page_to: int | None
    text: str
    word_count: int


@dataclass
class _Block:
    """A paragraph or table with the page it starts on."""

    text: str
    page: int | None

    @property
    def words(self) -> int:
        """Number of words in the block."""
        return len(self.text.split())


def _split_long(block: _Block) -> list[_Block]:
    """Cut a block that could not fit with the overlap at sentence ends (or by words as a last resort)."""
    if block.words <= PIECE_MAX:
        return [block]
    sentences = re.split(r"(?<=[.!?])\s+", block.text)
    pieces: list[list[str]] = [[]]
    count = 0
    for sentence in sentences:
        n = len(sentence.split())
        if n > PIECE_MAX:  # a "sentence" without punctuation: cut by words
            words = sentence.split()
            for i in range(0, len(words), TARGET_WORDS):
                pieces.append(words[i : i + TARGET_WORDS])
            pieces.append([])
            count = 0
            continue
        if count + n > TARGET_WORDS and pieces[-1]:
            pieces.append([])
            count = 0
        pieces[-1].append(sentence)
        count += n
    return [_Block(" ".join(p), block.page) for p in pieces if p]


def chunk_markdown(markdown: str) -> list[ChunkData]:
    """Split a document into chunks.

    Args:
        markdown: Text with ``<!--page:N-->`` markers and ``#`` headings.

    Returns:
        The chunks in document order.
    """
    chunks: list[ChunkData] = []
    headings: list[tuple[int, str]] = []
    page: int | None = None
    current: list[_Block] = []
    carry = ""  # overlap text for the next chunk of the same section

    def path() -> str | None:
        return " › ".join(title for _, title in headings) or None

    def flush(keep_overlap: bool) -> None:
        nonlocal current, carry
        if not current:
            return
        body = "\n\n".join(b.text for b in current)
        text = f"{carry}\n\n{body}".strip() if carry else body
        pages = [b.page for b in current if b.page is not None]
        chunks.append(
            ChunkData(len(chunks), path(), min(pages) if pages else None, max(pages) if pages else None, text, len(text.split()))
        )
        carry = " ".join(body.split()[-OVERLAP_WORDS:]) if keep_overlap else ""
        current = []

    def add(block: _Block) -> None:
        for piece in _split_long(block):
            size = len(carry.split()) + sum(b.words for b in current)
            if current and (size >= TARGET_WORDS or size + piece.words > MAX_WORDS):
                flush(keep_overlap=True)
            current.append(piece)

    paragraph: list[str] = []

    def end_paragraph() -> None:
        if paragraph:
            add(_Block("\n".join(paragraph).strip(), page))
            paragraph.clear()

    for line in markdown.split("\n"):
        stripped = line.strip()
        marker = _PAGE.match(stripped)
        heading = _HEADING.match(stripped)
        if marker:
            end_paragraph()
            page = int(marker.group(1))
        elif heading:
            end_paragraph()
            flush(keep_overlap=False)
            level = len(heading.group(1))
            while headings and headings[-1][0] >= level:
                headings.pop()
            headings.append((level, heading.group(2)))
            # The heading text itself is part of the first chunk of its section.
            current.append(_Block(heading.group(2), page))
        elif not stripped:
            end_paragraph()
        else:
            if paragraph and paragraph[0].lstrip().startswith("|") != stripped.startswith("|"):
                end_paragraph()
            paragraph.append(line)
    end_paragraph()
    flush(keep_overlap=False)
    # Heading-only fragments carry no answer; keep them only if nothing else exists.
    kept = [c for c in chunks if c.word_count >= 5] or chunks
    for ordinal, chunk in enumerate(kept):
        chunk.ordinal = ordinal
    return kept
