"""Chunking: size limits, headings, page numbers, tables, overlap, odd input."""

from app.services.chunking import MAX_WORDS, OVERLAP_WORDS, chunk_markdown


def words(n: int, prefix: str = "wort") -> str:
    """A paragraph of n distinct words."""
    return " ".join(f"{prefix}{i}" for i in range(n))


def test_empty_text_gives_no_chunks() -> None:
    assert chunk_markdown("") == []
    assert chunk_markdown("\n\n   \n") == []


def test_short_text_is_one_chunk() -> None:
    chunks = chunk_markdown("# Titel\n\nEin kurzer Absatz.")
    assert len(chunks) == 1 and chunks[0].ordinal == 0 and "kurzer Absatz" in chunks[0].text


def test_long_text_is_split_and_no_chunk_exceeds_the_maximum() -> None:
    text = "\n\n".join(words(120, f"a{i}x") for i in range(30))
    chunks = chunk_markdown(text)
    assert len(chunks) > 3
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))
    assert all(c.word_count <= MAX_WORDS for c in chunks)


def test_one_huge_paragraph_is_cut_inside() -> None:
    chunks = chunk_markdown(words(2000))
    assert len(chunks) >= 3 and all(c.word_count <= MAX_WORDS for c in chunks)


def test_consecutive_chunks_overlap() -> None:
    text = "\n\n".join(words(150, f"b{i}x") for i in range(10))
    chunks = chunk_markdown(text)
    tail = chunks[0].text.split()[-OVERLAP_WORDS:]
    assert set(tail) & set(chunks[1].text.split())


def test_headings_become_the_section_path() -> None:
    text = "# Vertrag\n\n## Kündigung\n\n" + words(50, "k") + "\n\n## Miete\n\n" + words(50, "m")
    paths = [c.section_path for c in chunk_markdown(text)]
    assert any(p and "Kündigung" in p for p in paths) or any(p and "Miete" in p for p in paths)
    assert all(p is None or "Vertrag" in p for p in paths)


def test_heading_only_text_makes_no_chunk() -> None:
    assert chunk_markdown("# Nur eine Überschrift\n\n## Und noch eine") == []


def test_page_markers_set_page_numbers_and_are_removed_from_the_text() -> None:
    text = "<!--page:1-->\n\n" + words(300, "p1_") + "\n\n<!--page:2-->\n\n" + words(300, "p2_")
    chunks = chunk_markdown(text)
    assert chunks[0].page_from == 1 and chunks[-1].page_to == 2
    assert all("<!--page" not in c.text for c in chunks)


def test_text_without_pages_has_no_page_numbers() -> None:
    chunk = chunk_markdown(words(40))[0]
    assert chunk.page_from is None and chunk.page_to is None


def test_a_table_is_not_cut_in_the_middle() -> None:
    rows = "\n".join(f"| zelle{i} | wert{i} |" for i in range(20))
    table = "| name | wert |\n| --- | --- |\n" + rows
    chunks = chunk_markdown(words(50) + "\n\n" + table + "\n\n" + words(50, "z"))
    holder = [c for c in chunks if "zelle0" in c.text]
    assert holder and "zelle19" in holder[0].text


def test_umlauts_and_emoji_survive() -> None:
    chunk = chunk_markdown("Über größere Änderungen müssen wir sprechen \U0001F600 dringend.")[0]
    assert "Über größere Änderungen" in chunk.text and "\U0001F600" in chunk.text
