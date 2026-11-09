"""Detect the type of an uploaded file from its content, not just its extension."""

import io
import zipfile
from dataclasses import dataclass
from pathlib import PurePath

MAX_UPLOAD_BYTES = 50 * 1024 * 1024


@dataclass(frozen=True)
class FileKind:
    """A supported document type.

    Attributes:
        key: Short stable key, e.g. ``pdf``.
        mime: Canonical MIME type stored with the document.
        label: Label shown in the UI.
    """

    key: str
    mime: str
    label: str


KINDS: dict[str, FileKind] = {
    k.key: k
    for k in (
        FileKind("pdf", "application/pdf", "PDF"),
        FileKind("txt", "text/plain", "TXT"),
        FileKind("md", "text/markdown", "Markdown"),
        FileKind(
            "docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "DOCX",
        ),
        FileKind(
            "pptx",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "PPTX",
        ),
        FileKind("html", "text/html", "HTML"),
        FileKind("epub", "application/epub+zip", "EPUB"),
        FileKind("url", "text/html", "Link"),
        FileKind("text", "text/plain", "Text"),
    )
}


def kind_for_mime(mime: str | None, source_type: str) -> str:
    """Return the kind key of a stored document.

    Args:
        mime: Stored MIME type.
        source_type: ``file``, ``url`` or ``text``.

    Returns:
        A key of ``KINDS``.
    """
    if source_type in ("url", "text"):
        return source_type
    for key, kind in KINDS.items():
        if kind.mime == mime and key not in ("url", "text"):
            return key
    return "txt"


def _zip_kind(data: bytes) -> str | None:
    """Tell DOCX, PPTX and EPUB apart by the files inside the ZIP container."""
    try:
        names = set(zipfile.ZipFile(io.BytesIO(data)).namelist())
    except zipfile.BadZipFile:
        return None
    if "word/document.xml" in names:
        return "docx"
    if "ppt/presentation.xml" in names:
        return "pptx"
    if "META-INF/container.xml" in names:
        return "epub"
    return None


def detect_kind(data: bytes, filename: str) -> str | None:
    """Detect the document type from the bytes.

    The extension only decides between plain text and Markdown, and must be a text extension
    for text content.

    Args:
        data: The file content.
        filename: Original file name.

    Returns:
        A key of ``KINDS`` (``pdf``, ``txt``, ``md``, ``docx``, ``pptx``, ``html``, ``epub``)
        or None if the type is not supported.
    """
    if data[:1024].lstrip().startswith(b"%PDF"):
        return "pdf"
    if data[:4] == b"PK\x03\x04":
        return _zip_kind(data)
    head = data[:8192]
    if b"\x00" in head:
        return None
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return None
    ext = PurePath(filename).suffix.lower()
    start = text[:2048].lstrip().lower()
    if start.startswith(("<!doctype html", "<html")) or ext in (".html", ".htm"):
        return "html"
    if ext in (".md", ".markdown"):
        return "md"
    if ext == ".txt":
        return "txt"
    return None
