"""Background job: extract the text of a document."""

import asyncio
import uuid

from app.jobs.app import procrastinate_app
from app.services.ingestion import run_extraction


@procrastinate_app.task(name="extract_document")
async def extract_document(document_id: str) -> None:
    """Extract a document's text in a thread (the libraries are synchronous).

    Args:
        document_id: Id of the document as a string.
    """
    await asyncio.to_thread(run_extraction, uuid.UUID(document_id))
