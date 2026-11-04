"""Import a web page: normalise the address, fetch it safely, check it has real text."""

import ipaddress
import socket
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx

from app.errors import ApiError

MAX_PAGE_BYTES = 10 * 1024 * 1024
MIN_WORDS = 200
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0 Safari/537.36"
)
_TRACKING = {"fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid", "yclid", "_ga"}


def _bad(message: str, code: str = "url_unreadable") -> ApiError:
    """Build the 422 error; for ``url_*`` codes the frontend offers to paste the text instead."""
    return ApiError(422, code, message)


def normalize_url(raw: str) -> str:
    """Make equal addresses compare equal: lowercase host, no fragment, no tracking parameters.

    Args:
        raw: The address as typed.

    Returns:
        The normalised address.

    Raises:
        ApiError: If it is not an http or https address.
    """
    parts = urlsplit(raw.strip())
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise _bad(
            "Das ist keine gültige Adresse. Sie muss mit http:// oder https:// beginnen.",
            "url_invalid",
        )
    query = sorted(
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if not k.lower().startswith("utm_") and k.lower() not in _TRACKING
    )
    path = parts.path.rstrip("/") or "/"
    netloc = parts.netloc.lower()
    return urlunsplit((parts.scheme, netloc, path, urlencode(query), ""))


def _check_public(host: str) -> None:
    """Refuse addresses on private, loopback or link-local networks.

    NOTE: This resolves the name once before the request. A hostile DNS server could still
    answer differently later (DNS rebinding); acceptable for a household server.

    Raises:
        ApiError: If the host resolves to a non-public address or cannot be resolved.
    """
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise _bad("Diese Adresse wurde nicht gefunden.", "url_not_found") from None
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise _bad("Diese Adresse darf nicht abgerufen werden.", "url_blocked")


def _guard(request: httpx.Request) -> None:
    """Check every request, including redirect targets."""
    _check_public(request.url.host)


def fetch_html(url: str) -> str:
    """Download a page (15 s timeout, 10 MB cap, up to 5 redirects).

    Args:
        url: A normalised http(s) address.

    Returns:
        The HTML text.

    Raises:
        ApiError: With a German message if the page cannot be loaded.
    """
    try:
        with (
            httpx.Client(
                timeout=15,
                follow_redirects=True,
                max_redirects=5,
                headers={"User-Agent": _USER_AGENT, "Accept-Language": "de,en;q=0.8"},
                event_hooks={"request": [_guard]},
            ) as client,
            client.stream("GET", url) as response,
        ):
            if response.status_code in (401, 403, 451):
                raise _bad(
                    "Die Seite verlangt eine Anmeldung oder blockiert den Abruf.", "url_forbidden"
                )
            if response.status_code == 404:
                raise _bad("Diese Seite gibt es nicht (Fehler 404).", "url_not_found")
            if response.status_code >= 400:
                raise _bad(f"Die Seite hat mit einem Fehler geantwortet ({response.status_code}).")
            if "html" not in response.headers.get("content-type", "html").lower():
                raise _bad("Unter dieser Adresse liegt keine Webseite.", "url_not_html")
            data = bytearray()
            for chunk in response.iter_bytes():
                data += chunk
                if len(data) > MAX_PAGE_BYTES:
                    raise _bad("Die Seite ist größer als 10 MB.", "url_too_large")
            return bytes(data).decode(response.encoding or "utf-8", errors="replace")
    except httpx.TimeoutException:
        raise _bad(
            "Die Seite hat nicht rechtzeitig geantwortet (15 Sekunden).", "url_timeout"
        ) from None
    except httpx.HTTPError:
        raise _bad("Die Seite konnte nicht geladen werden.") from None
