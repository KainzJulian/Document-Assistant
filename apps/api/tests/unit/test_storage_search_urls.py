"""File names and storage, the chat search snippet and the address safety check."""

import socket
import uuid
from types import SimpleNamespace

import httpx
import pytest

from app.errors import ApiError
from app.services import urlimport
from app.services.chatsearch import _snippet
from app.services.storage import delete_document_files, document_dir, safe_filename, save_file


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("bericht.pdf", "bericht.pdf"),
        ("Bericht (final) äöü ß.pdf", "Bericht (final) äöü ß.pdf"),
        ("../../etc/passwd", "passwd"),
        ("C:\\Users\\anna\\brief.docx", "brief.docx"),
        ("ev<il>:*?.txt", "ev_il____.txt"),
        (".versteckt", "versteckt"),
        ("...", "datei"),
        ("", "datei"),
    ],
)
def test_file_names_are_reduced_to_harmless_ones(raw, expected):
    assert safe_filename(raw) == expected


def test_file_names_are_cut_at_120_characters():
    assert len(safe_filename("a" * 500 + ".pdf")) == 120


def test_files_are_stored_per_owner_and_document_and_removed_again():
    owner, document = uuid.uuid4(), uuid.uuid4()
    path = save_file(owner, document, "../notiz.txt", b"hallo")
    assert path.parent == document_dir(owner, document) and path.name == "notiz.txt"
    assert path.read_bytes() == b"hallo"
    delete_document_files(owner, document)
    assert not path.exists()
    delete_document_files(owner, document)


def test_the_snippet_marks_the_word_closest_to_a_misspelt_query():
    snippet = _snippet("Die Zusammenfassung des Jahresberichts ist fertig.", "Zusamenfassung")
    assert "[[Zusammenfassung]]" in snippet


def test_the_snippet_is_cut_with_ellipses_around_the_match():
    content = "x" * 200 + " Kündigung " + "y" * 200
    snippet = _snippet(content, "Kündigung")
    assert snippet.startswith("…") and snippet.endswith("…") and "[[Kündigung]]" in snippet and len(snippet) < 200


def test_without_a_match_the_snippet_is_the_start_of_the_message():
    assert _snippet("Ganz anderer Inhalt hier", "Quantenphysik") == "Ganz anderer Inhalt hier"
    assert len(_snippet("wort " * 100, "Quantenphysik")) <= 140


def resolve_to(monkeypatch, address, allow_private=False):
    """Make every host name resolve to one address."""
    family = socket.AF_INET6 if ":" in address else socket.AF_INET
    monkeypatch.setattr(urlimport.socket, "getaddrinfo", lambda host, port: [(family, socket.SOCK_STREAM, 6, "", (address, 0))])
    monkeypatch.setattr(urlimport, "get_settings", lambda: SimpleNamespace(allow_private_urls=allow_private))


@pytest.mark.parametrize("address", ["127.0.0.1", "10.0.0.5", "192.168.1.20", "172.18.0.2", "169.254.169.254", "::1", "224.0.0.1"])
def test_private_loopback_and_metadata_addresses_are_refused(monkeypatch, address):
    resolve_to(monkeypatch, address)
    with pytest.raises(ApiError) as error:
        urlimport._check_public("beispiel.test")
    assert error.value.code == "url_blocked" and error.value.status == 422


def test_a_public_address_is_allowed(monkeypatch):
    resolve_to(monkeypatch, "93.184.216.34")
    urlimport._check_public("beispiel.test")


def test_private_addresses_can_be_allowed_for_the_test_stack(monkeypatch):
    resolve_to(monkeypatch, "10.0.0.5", allow_private=True)
    urlimport._check_public("fixtures")


def test_an_unknown_host_is_a_clear_error(monkeypatch):
    def fail(host, port):
        raise socket.gaierror("unbekannt")

    monkeypatch.setattr(urlimport.socket, "getaddrinfo", fail)
    with pytest.raises(ApiError) as error:
        urlimport._check_public("gibt-es-nicht.test")
    assert error.value.code == "url_not_found"


def test_every_redirect_target_is_checked_too(monkeypatch):
    resolve_to(monkeypatch, "10.0.0.5")
    with pytest.raises(ApiError):
        urlimport._guard(httpx.Request("GET", "http://intern.test/admin"))
