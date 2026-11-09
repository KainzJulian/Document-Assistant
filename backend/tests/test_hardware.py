"""The Ollama hardware check: memory estimate, the four verdicts, the warning rule, the API."""

import pytest
from fastapi.testclient import TestClient

from app.services.hardware import Hardware, estimate_words_per_s, need_gb, verdict_for


def hw(ram_free: float, vram_free: float = 0, gpu: bool = False) -> Hardware:
    """Build hardware for a case."""
    return Hardware(ram_total_gb=32, ram_free_gb=ram_free, gpu_name="Test GPU" if gpu else None, vram_total_gb=vram_free, vram_free_gb=vram_free)


def test_need_formula_matches_the_plan() -> None:
    assert need_gb(4.9, 8.0, 8192) == pytest.approx(1.15 * 4.9 + 0.5)
    assert need_gb(9.0, 14.0, 16384) == pytest.approx(1.15 * 9.0 + 0.5 * 2 * 1.75)


@pytest.mark.parametrize(
    ("hardware", "need", "expected"),
    [
        (hw(16, 24, gpu=True), 6, "fits"),
        (hw(16, 6, gpu=True), 6, "fits"),
        (hw(16, 4, gpu=True), 6, "partial"),
        (hw(10, 4, gpu=True), 13, "partial"),
        (hw(1, 4, gpu=True), 6, "too_big"),
        (hw(11), 6, "cpu_only"),
        (hw(16, 0, gpu=True), 6, "cpu_only"),
        (hw(4), 6, "too_big"),
    ],
)
def test_verdicts_for_eight_hardware_cases(hardware: Hardware, need: float, expected: str) -> None:
    assert verdict_for(need, hardware) == expected


def test_speed_estimate_uses_bandwidth_and_size() -> None:
    assert estimate_words_per_s(0) is None
    assert estimate_words_per_s(4.0) == pytest.approx(estimate_words_per_s(8.0) * 2, rel=0.05)


def test_fit_endpoint_warns_once_per_verdict(admin: TestClient) -> None:
    first = admin.get("/api/hardware/ollama-fit", params={"model": "qwen2.5:32b"}).json()
    assert first["verdict"] == "too_big" and first["needs_warning"] is True and first["gpu"] is None
    assert first["ram_free_gb"] == 11.2 and first["ram_total_gb"] == 16
    admin.post("/api/settings/ollama-ack", json={"model": "qwen2.5:32b", "verdict": "too_big"})
    again = admin.get("/api/hardware/ollama-fit", params={"model": "qwen2.5:32b"}).json()
    assert again["needs_warning"] is False and again["acknowledged"] == "too_big"


def test_small_model_runs_on_cpu_with_a_speed_estimate(admin: TestClient) -> None:
    data = admin.get("/api/hardware/ollama-fit", params={"model": "llama3.1:8b"}).json()
    assert data["verdict"] == "cpu_only" and data["est_words_per_s"] > 0 and data["needs_warning"] is True


def test_fit_endpoint_needs_login(anon: TestClient) -> None:
    assert anon.get("/api/hardware/ollama-fit", params={"model": "llama3.1:8b"}).status_code == 401


def test_benchmark_reports_words_per_second(admin: TestClient) -> None:
    data = admin.post("/api/hardware/ollama-benchmark", json={"model": "llama3.1:8b"}).json()
    assert data["tokens"] > 0 and data["words_per_s"] > 0
