"""FastAPI application entry point."""

from fastapi import APIRouter, Depends, FastAPI

from app.deps import require_csrf_header
from app.errors import register_error_handlers
from app.routers import auth, health, users

app = FastAPI(title="Document Assistant", docs_url="/api/docs", openapi_url="/api/openapi.json")
register_error_handlers(app)

# NOTE: Every state-changing request needs the X-Requested-With header (CSRF), on top of
# the SameSite=Strict cookie.
api = APIRouter(prefix="/api", dependencies=[Depends(require_csrf_header)])
api.include_router(health.router)
api.include_router(auth.router)
api.include_router(users.router)
app.include_router(api)
