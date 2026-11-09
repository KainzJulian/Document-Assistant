#!/bin/sh
# Write hardware/hardware.json with the GPU name and VRAM (GB), or {"gpu": null}.
# Run at setup and with `make hw-refresh`. The api reads the file read-only.
# nvidia-smi is supported fully; AMD (rocm-smi) is best effort and needs python3.
set -eu
cd "$(dirname "$0")/.."
OUT="hardware/hardware.json"
mkdir -p hardware

if command -v nvidia-smi >/dev/null 2>&1 && line=$(nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits 2>/dev/null | head -1) && [ -n "$line" ]; then
  name=$(echo "$line" | cut -d, -f1 | sed 's/^ *//;s/ *$//')
  total=$(echo "$line" | cut -d, -f2 | tr -d ' ')
  free=$(echo "$line" | cut -d, -f3 | tr -d ' ')
  awk -v n="$name" -v t="$total" -v f="$free" 'BEGIN { printf "{\"gpu\": {\"name\": \"%s\", \"vram_total_gb\": %.2f, \"vram_free_gb\": %.2f}}\n", n, t/1024, f/1024 }' > "$OUT"
elif command -v rocm-smi >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
  rocm-smi --showproductname --showmeminfo vram --json 2>/dev/null | python3 -c '
import json, sys
d = json.load(sys.stdin)
card = next(iter(d.values()))
name = card.get("Card Series") or card.get("Card series") or "AMD GPU"
total = int(card.get("VRAM Total Memory (B)", 0)) / 1024**3
used = int(card.get("VRAM Total Used Memory (B)", 0)) / 1024**3
print(json.dumps({"gpu": {"name": name, "vram_total_gb": round(total, 2), "vram_free_gb": round(total - used, 2)}}))
' > "$OUT" || echo '{"gpu": null}' > "$OUT"
else
  echo '{"gpu": null}' > "$OUT"
fi
echo "Hardware gespeichert in $OUT:"
cat "$OUT"
