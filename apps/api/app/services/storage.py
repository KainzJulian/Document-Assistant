"""Original files on the ``files`` volume: ``<owner>/<document_id>/<filename>``."""

import re
import shutil
import uuid
from pathlib import Path

from app.config import get_settings

_UNSAFE = re.compile(r"[^\w.\- ()\[\]äöüÄÖÜß]")


def safe_filename(filename: str) -> str:
    """Reduce a client-supplied name to a harmless file name.

    Args:
        filename: Name as sent by the browser.

    Returns:
        A name without path parts or special characters, at most 120 characters.
    """
    name = _UNSAFE.sub("_", Path(filename.replace("\\", "/")).name).strip(". ")
    return (name or "datei")[:120]


def document_dir(owner_id: uuid.UUID, document_id: uuid.UUID) -> Path:
    """Return the folder of one document's files."""
    return Path(get_settings().files_dir) / str(owner_id) / str(document_id)


def save_file(owner_id: uuid.UUID, document_id: uuid.UUID, filename: str, data: bytes) -> Path:
    """Write an uploaded file to disk.

    Args:
        owner_id: Owner of the document.
        document_id: Id of the document.
        filename: Original file name (sanitised here).
        data: File content.

    Returns:
        The path of the stored file.
    """
    folder = document_dir(owner_id, document_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / safe_filename(filename)
    path.write_bytes(data)
    return path


def delete_document_files(owner_id: uuid.UUID, document_id: uuid.UUID) -> None:
    """Remove all files of a document (original and raw HTML)."""
    shutil.rmtree(document_dir(owner_id, document_id), ignore_errors=True)
