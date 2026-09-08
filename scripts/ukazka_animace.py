"""Ukazka: dvousnimkova animace z free-exercise-db.

Dataset ma u kazdeho cviku dve fotky - vychozi a koncovou pozici. Slozenim
do animovaneho WebP vznikne smycka, ktera pohyb opravdu ukazuje. Zdroj je
public domain (The Unlicense), takze zadna licencni past.

Spusteni:
    python scripts/ukazka_animace.py
Vystup: scripts/ukazka/<id>.webp
"""

from __future__ import annotations

import io
import sys
import urllib.request
from pathlib import Path

from PIL import Image

RAW = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises"
UKAZKY = ["Pushups", "Plank", "Barbell_Squat", "Dumbbell_Bicep_Curl"]
SIRKA = 640
PRODLEVA_MS = 700
VYSTUP = Path(__file__).resolve().parent / "ukazka"


def stahni(url: str) -> Image.Image:
    with urllib.request.urlopen(url, timeout=60) as odpoved:
        data = odpoved.read()
    return Image.open(io.BytesIO(data)).convert("RGB")


def zmensi(snimek: Image.Image) -> Image.Image:
    if snimek.width <= SIRKA:
        return snimek
    vyska = round(snimek.height * SIRKA / snimek.width)
    return snimek.resize((SIRKA, vyska), Image.LANCZOS)


def uloz_animaci(klic: str) -> Path:
    snimky = [zmensi(stahni(f"{RAW}/{klic}/{i}.jpg")) for i in (0, 1)]
    prvni, *zbytek = snimky
    VYSTUP.mkdir(parents=True, exist_ok=True)
    cesta = VYSTUP / f"{klic}.webp"
    prvni.save(
        cesta,
        format="WEBP",
        save_all=True,
        append_images=zbytek,
        duration=PRODLEVA_MS,
        loop=0,
        quality=80,
        method=6,
    )
    return cesta


def main() -> int:
    for klic in UKAZKY:
        try:
            cesta = uloz_animaci(klic)
        except Exception as chyba:  # noqa: BLE001 - ukazkovy skript
            print(f"{klic}: CHYBA {chyba}", file=sys.stderr)
            continue
        print(f"{klic}: {cesta} ({cesta.stat().st_size // 1024} kB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
