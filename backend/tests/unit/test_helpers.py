"""Small pure helpers: URL handling, summary maths, secrets, file types, fusion."""

import uuid

import pytest

from app.errors import ApiError
from app.services import secrets
from app.services.filetypes import detect_kind
from app.services.retrieval import fuse
from app.services.summarising import TARGETS, effective_target, split_parts, within_tolerance
from app.services.urlimport import normalize_url


def test_url_normalisation_removes_tracking_and_fragment() -> None:
    a = normalize_url("HTTPS://Example.com/Artikel/?utm_source=x&b=2&a=1#kapitel")
    b = normalize_url("https://example.com/Artikel?a=1&b=2&fbclid=zzz")
    assert a == b == "https://example.com/Artikel?a=1&b=2"


@pytest.mark.parametrize("bad", ["ftp://example.com/x", "example.com", "javascript:alert(1)", "https://"])
def test_url_normalisation_rejects_non_http(bad: str) -> None:
    with pytest.raises(ApiError) as error:
        normalize_url(bad)
    assert error.value.code == "url_invalid"


def test_target_is_capped_at_a_third_of_the_source() -> None:
    assert effective_target("xl", 10_000) == (1200, None)
    target, note = effective_target("xl", 300)
    assert target == 100 and note and "100" in note
    assert effective_target("xs", 20)[0] == 10
    assert set(TARGETS) == {"xs", "s", "m", "l", "xl"}


def test_tolerance_is_plus_minus_twenty_percent() -> None:
    assert within_tolerance(120, 100) and within_tolerance(80, 100)
    assert not within_tolerance(121, 100) and not within_tolerance(79, 100)


def test_split_parts_groups_paragraphs_without_cutting_them() -> None:
    paragraphs = ["wort " * 40 for _ in range(10)]
    parts = split_parts("\n\n".join(paragraphs), size=100)
    assert len(parts) == 5 and all(len(p.split()) <= 120 for p in parts)
    assert split_parts("") == []


def test_secrets_round_trip_and_garbage_is_a_clear_error() -> None:
    token = secrets.encrypt("sk-geheim")
    assert "sk-geheim" not in token and secrets.decrypt(token) == "sk-geheim"
    with pytest.raises(ApiError) as error:
        secrets.decrypt("kein-token")
    assert error.value.code == "key_unreadable"


def test_file_type_is_detected_by_content_not_name() -> None:
    assert detect_kind(b"%PDF-1.7 ...", "x.txt") == "pdf"
    assert detect_kind(b"nur Text", "x.pdf") is None
    assert detect_kind(b"nur Text", "x.txt") == "txt"
    assert detect_kind(b"\x00\x01\x02\xff" * 50, "x.exe") is None


def test_rank_fusion_prefers_items_found_by_both_searches() -> None:
    a, b, c = (uuid.uuid4() for _ in range(3))
    ranked = [i for i, _ in fuse([a, b], [b, c])]
    assert ranked[0] == b and set(ranked) == {a, b, c}
    assert fuse([], []) == []
