"""Background jobs: switch the embedding model and purge old vectors."""

from app.jobs.app import procrastinate_app
from app.services.indexing import purge_retired, reindex


@procrastinate_app.task(name="reindex_embedding_model")
async def reindex_embedding_model(model_id: int) -> None:
    """Build vectors for all chunks with a new model and switch to it when done.

    Args:
        model_id: Id of the embedding model in status ``building``.
    """
    await reindex(model_id)


@procrastinate_app.periodic(cron="17 3 * * *")
@procrastinate_app.task(name="purge_retired_embeddings")
async def purge_retired_embeddings(timestamp: int) -> None:
    """Every night: delete vectors of models retired more than 7 days ago.

    Args:
        timestamp: Scheduled time (passed by Procrastinate).
    """
    purge_retired()
