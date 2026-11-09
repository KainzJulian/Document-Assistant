"""Server RAM and GPU, the memory a model needs, and the four verdicts of the Ollama check."""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

import psutil

from app.config import get_settings

SEVERITY = {"fits": 0, "partial": 1, "cpu_only": 2, "too_big": 3}
_GB = 1024**3


@dataclass
class Hardware:
    """What the server has right now.

    Attributes:
        ram_total_gb: Installed RAM.
        ram_free_gb: RAM available for new programs.
        gpu_name: GPU name, or None without a GPU.
        vram_total_gb: GPU memory in total (0 without a GPU).
        vram_free_gb: GPU memory free (0 without a GPU).
    """

    ram_total_gb: float
    ram_free_gb: float
    gpu_name: str | None
    vram_total_gb: float
    vram_free_gb: float


def read_hardware() -> Hardware:
    """Read live RAM (psutil) and the GPU facts from ``hardware.json`` (see ``make hw-refresh``).

    Returns:
        The current hardware; a missing or broken ``hardware.json`` means "no GPU".
    """
    memory = psutil.virtual_memory()
    data: dict[str, object] = {}
    try:
        data = json.loads(Path(get_settings().hardware_json).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    gpu_raw = data.get("gpu")
    gpu = cast(dict[str, object], gpu_raw) if isinstance(gpu_raw, dict) else {}
    # NOTE: hardware.json may fix the RAM numbers ("ram_total_gb", "ram_free_gb"); tests use this
    # so verdicts are the same on every machine.
    total = float(data.get("ram_total_gb") or memory.total / _GB)  # type: ignore[arg-type]
    free = float(data.get("ram_free_gb") or memory.available / _GB)  # type: ignore[arg-type]
    return Hardware(
        ram_total_gb=total,
        ram_free_gb=free,
        gpu_name=str(gpu["name"]) if gpu.get("name") else None,
        vram_total_gb=float(gpu.get("vram_total_gb") or 0),  # type: ignore[arg-type]
        vram_free_gb=float(gpu.get("vram_free_gb") or 0),  # type: ignore[arg-type]
    )


def need_gb(file_gb: float, params_b: float, context: int) -> float:
    """Estimate the memory a model needs: ``1.15 x file + 0.5 x context/8192 x params/8``.

    Args:
        file_gb: Size of the model file in GB.
        params_b: Parameters in billions.
        context: Context size in tokens.

    Returns:
        The estimated need in GB.
    """
    return 1.15 * file_gb + 0.5 * (context / 8192) * (params_b / 8)


def verdict_for(need: float, hw: Hardware) -> Literal["fits", "partial", "cpu_only", "too_big"]:
    """Map the need and the free memory to one of the four verdicts.

    Args:
        need: Memory the model needs in GB.
        hw: The server's hardware.

    Returns:
        ``fits``, ``partial``, ``cpu_only`` or ``too_big``.
    """
    if hw.gpu_name and hw.vram_free_gb >= need:
        return "fits"
    if hw.gpu_name and 0 < hw.vram_free_gb < need and hw.vram_free_gb + hw.ram_free_gb >= need:
        return "partial"
    if hw.ram_free_gb >= need:
        return "cpu_only"
    return "too_big"


def estimate_words_per_s(file_gb: float) -> float | None:
    """Estimate CPU speed as memory bandwidth divided by model size (0.75 words per token).

    Args:
        file_gb: Size of the model file in GB.

    Returns:
        Words per second, or None if the size is unknown.
    """
    if file_gb <= 0:
        return None
    return round(get_settings().memory_bandwidth_gb_s / file_gb * 0.75, 1)
