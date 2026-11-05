"""FastAPI application entry point."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI

from app.deps import require_csrf_header
from app.errors import register_error_handlers
from app.jobs.app import procrastinate_app
from app.routers import admin_providers, auth, chats, documents, embeddings, hardware, health, settings, summaries, users


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    """Keep a connection pool to the job queue open while the api runs."""
    async with procrastinate_app.open_async():
        yield


app = FastAPI(
    title="Document Assistant",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
register_error_handlers(app)

# NOTE: Every state-changing request needs the X-Requested-With header (CSRF), on top of
# the SameSite=Strict cookie.
api = APIRouter(prefix="/api", dependencies=[Depends(require_csrf_header)])
api.include_router(health.router)
api.include_router(auth.router)
api.include_router(users.router)
api.include_router(documents.router)
api.include_router(summaries.router)
api.include_router(admin_providers.router)
api.include_router(embeddings.router)
api.include_router(chats.router)
api.include_router(chats.chunk_router)
api.include_router(settings.router)
api.include_router(hardware.router)
app.include_router(api)
