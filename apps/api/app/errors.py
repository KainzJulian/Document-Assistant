"""Error envelope ``{"error": {"code", "message", "details"}}`` with German messages."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    """Application error that is rendered as the standard error envelope.

    Attributes:
        status: HTTP status code.
        code: Stable machine-readable code, e.g. ``invalid_credentials``.
        message: German, user-facing message.
        details: Optional extra data for the client.
    """

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        details: dict[str, object] | None = None,
    ) -> None:
        """Create the error.

        Args:
            status: HTTP status code.
            code: Stable machine-readable code.
            message: German, user-facing message.
            details: Optional extra data for the client.
        """
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}


def _envelope(status: int, code: str, message: str, details: dict[str, object]) -> JSONResponse:
    """Build the JSON response for an error."""
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details}},
    )


def register_error_handlers(app: FastAPI) -> None:
    """Attach handlers so every error uses the standard envelope.

    Args:
        app: The FastAPI application.
    """

    async def on_api_error(_: Request, exc: Exception) -> JSONResponse:
        """Render an ``ApiError``."""
        assert isinstance(exc, ApiError)
        return _envelope(exc.status, exc.code, exc.message, exc.details)

    async def on_http_error(_: Request, exc: Exception) -> JSONResponse:
        """Render framework HTTP errors such as 404."""
        assert isinstance(exc, StarletteHTTPException)
        messages = {
            401: "Bitte melde dich an.",
            403: "Dafür fehlt die Berechtigung.",
            404: "Nicht gefunden.",
        }
        return _envelope(
            exc.status_code,
            f"http_{exc.status_code}",
            messages.get(exc.status_code, "Anfrage fehlgeschlagen."),
            {},
        )

    async def on_validation_error(_: Request, exc: Exception) -> JSONResponse:
        """Render request validation errors."""
        assert isinstance(exc, RequestValidationError)
        return _envelope(
            422,
            "validation_error",
            "Die Eingabe ist ungültig.",
            {"errors": [{"loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors()]},
        )

    app.add_exception_handler(ApiError, on_api_error)
    app.add_exception_handler(StarletteHTTPException, on_http_error)
    app.add_exception_handler(RequestValidationError, on_validation_error)
