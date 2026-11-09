"""Turn an uploaded file into extracted text (the job behind the status chip)."""

import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.db.models import Document, DocumentText
from app.db.session import get_engine
from app.services.extractors import ExtractionError, detect_language, extract, word_count
from app.services.filetypes import kind_for_mime
from app.services.storage import stored_path

log = logging.getLogger(__name__)


def set_status(db: Session, doc: Document, status: str, error: str | None = None) -> None:
    """Save a status change; the library watches ``updated_at``."""
    doc.status = status
    doc.error = error
    doc.updated_at = datetime.now(UTC)
    db.commit()


def run_extraction(document_id: uuid.UUID) -> bool:
    """Read a stored file, save its Markdown and set the document to ``indexing`` or ``failed``.

    Args:
        document_id: Id of the document to process.

    Returns:
        True if the text was saved and the document now waits for indexing.
    """
    with Session(get_engine()) as db:
        doc = db.get(Document, document_id)
        if doc is None:
            return False
        default_title = Path(doc.filename or "").stem
        set_status(db, doc, "reading")
        try:
            kind = kind_for_mime(doc.mime, doc.source_type)
            path = stored_path(doc)
            result = extract(kind, path)
            existing = db.get(DocumentText, doc.id)
            if existing is None:
                db.add(
                    DocumentText(
                        document_id=doc.id, markdown=result.markdown, extractor=result.extractor
                    )
                )
            else:
                existing.markdown = result.markdown
                existing.extractor = result.extractor
                existing.extracted_at = datetime.now(UTC)
            if result.title and doc.title == default_title:
                doc.title = result.title[:300]
            doc.page_count = result.page_count
            doc.word_count = word_count(result.markdown)
            doc.language = detect_language(result.markdown)
            set_status(db, doc, "indexing")
            return True
        except ExtractionError as error:
            db.rollback()
            set_status(db, doc, "failed", str(error))
            return False
        except Exception:
            log.exception("Extraction of %s failed", document_id)
            db.rollback()
            set_status(db, doc, "failed", "Das Dokument konnte nicht gelesen werden.")
            return False
