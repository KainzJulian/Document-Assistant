"""FastAPI application entry point."""

from fastapi import APIRouter, FastAPI

from app.errors import register_error_handlers
from app.routers import health

app = FastAPI(title="Document Assistant", docs_url="/api/docs", openapi_url="/api/openapi.json")
register_error_handlers(app)

api = APIRouter(prefix="/api")
api.include_router(health.router)
app.include_router(api)
