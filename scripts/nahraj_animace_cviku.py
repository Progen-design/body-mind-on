"""Upload vlastních animací cviků do Supabase Storage — FÁZE 2 (docs/DALSI_KROK.md 9.12).

NESPOUŠTÍ SE ODTUD AUTOMATICKY. Potřebuje:
  - bucket `exercise-media` už vytvořený migrací
    (supabase/migrations/20260910100000_exercise_media_bucket.sql) — tu
    aplikuje Honzův druhý Claude, ne tenhle skript,
  - SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY v env (nikdy natvrdo),
  - hotové soubory z scripts/generuj_animace_cviku.py v build/exercise-media/.

Cesta v bucketu: cviky/<canonical_key>.webp
Content-Type: image/webp
Cache-Control: public, max-age=31536000, immutable
Upsert: true — bezpečné pustit znovu (idempotentní).

Spuštění:
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python scripts/nahraj_animace_cviku.py
    ... --dry-run                # nic nenahraje, jen vypíše, co by se stalo
    ... --only squat --only plank
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")

BUCKET = "exercise-media"
KOREN = Path(__file__).resolve().parent.parent
VYSTUPNI_SLOZKA = KOREN / "build" / "exercise-media"
MAPOVANI_SOUBOR = Path(__file__).resolve().parent / "data" / "mapovani_animace_skupina_a.json"


def nacti_klice(cesta: Path = MAPOVANI_SOUBOR) -> list[str]:
    with cesta.open("r", encoding="utf-8") as f:
        polozky = json.load(f)
    return [p["canonical_key"] for p in polozky]


def nahraj(url_base: str, service_key: str, klic: str, cesta_souboru: Path, dry_run: bool) -> bool:
    cesta_v_bucketu = f"cviky/{klic}.webp"
    if dry_run:
        print(f"[dry-run] {cesta_souboru} -> {BUCKET}/{cesta_v_bucketu}")
        return True

    data = cesta_souboru.read_bytes()
    url = f"{url_base.rstrip('/')}/storage/v1/object/{BUCKET}/{cesta_v_bucketu}"
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
            "Content-Type": "image/webp",
            "x-upsert": "true",
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as odpoved:
            odpoved.read()
        return True
    except urllib.error.HTTPError as chyba:
        telo = chyba.read().decode("utf-8", "replace")
        print(f"  CHYBA {klic}: HTTP {chyba.code} {telo}", file=sys.stderr)
        return False
    except urllib.error.URLError as chyba:
        print(f"  CHYBA {klic}: síť {chyba.reason}", file=sys.stderr)
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--only", action="append", default=None, help="omezit na canonical_key (lze víckrát)")
    parser.add_argument(
        "--mapovani-soubor",
        default=str(MAPOVANI_SOUBOR),
        help="cesta k mapování canonical_key -> fed_id (výchozí: skupina A)",
    )
    args = parser.parse_args()

    url_base = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not args.dry_run and (not url_base or not service_key):
        print("Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY v env.", file=sys.stderr)
        return 1

    klice = nacti_klice(Path(args.mapovani_soubor))
    if args.only:
        pozadovane = set(args.only)
        klice = [k for k in klice if k in pozadovane]

    hotovo = 0
    problemy: list[str] = []
    for klic in klice:
        cesta = VYSTUPNI_SLOZKA / f"{klic}.webp"
        if not cesta.exists():
            problemy.append(klic)
            print(f"  CHYBÍ SOUBOR: {klic} (spusť napřed generuj_animace_cviku.py)", file=sys.stderr)
            continue
        if nahraj(url_base, service_key, klic, cesta, args.dry_run):
            hotovo += 1
        else:
            problemy.append(klic)

    print(f"\nHotovo: {hotovo}/{len(klice)}")
    if problemy:
        print("Selhalo / chybí soubor:", ", ".join(problemy))
    return 1 if problemy else 0


if __name__ == "__main__":
    raise SystemExit(main())
