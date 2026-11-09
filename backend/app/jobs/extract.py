"""Background job: extract the text of a document, then chunk and embed it."""

import asyncio
import uuid

from app.jobs.app import procrastinate_app
from app.services.indexing import index_document
from app.services.ingestion import run_extraction


@procrastinate_app.task(name="extract_document")
async def extract_document(document_id: str) -> None:
    """Extract a document's text (in a thread, the libraries are synchronous), then index it.

    Args:
        document_id: Id of the document as a string.
    """
    doc_id = uuid.UUID(document_id)
    if await asyncio.to_thread(run_extraction, doc_id):
        await index_document(doc_id)
