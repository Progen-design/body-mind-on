"""Generátor vlastních animací cviků — navazuje na scripts/ukazka_animace.py.

Bere mapování canonical_key -> free-exercise-db id ze
scripts/data/mapovani_animace_skupina_a.json (skupina A — 193 jistých shod,
docs/DALSI_KROK.md 9.12) a pro každý cvik stáhne dvě fotky ze
zdroje (Unlicense), slozi je do animovaneho WebP a ulozi do
build/exercise-media/<canonical_key>.webp.

IDEMPOTENTNI: cvik, ktery uz ma vystupni soubor, se preskoci (neni co delat
znovu). --force ho prepise.

Spusteni:
    python scripts/generuj_animace_cviku.py                 # vse ze skupiny A
    python scripts/generuj_animace_cviku.py --dry-run        # jen vypis, nic nestahuje
    python scripts/generuj_animace_cviku.py --only squat     # jeden cvik
    python scripts/generuj_animace_cviku.py --only squat --only plank
    python scripts/generuj_animace_cviku.py --force          # prepise i hotove

Vystup: souhrn na konci (kolik hotovo, kolik preskoceno, kolik selhalo) +
seznam selhani s duvodem. build/ je v .gitignore, nic odtud se necommituje.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

# Windows konzole má jinak jiné kódování než utf-8 a diakritika se rozsype.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")

RAW = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises"
SIRKA = 640
PRODLEVA_MS = 700
CIL_KB = 60
KVALITA = 60

KOREN = Path(__file__).resolve().parent.parent
MAPOVANI_SOUBOR = Path(__file__).resolve().parent / "data" / "mapovani_animace_skupina_a.json"
VYSTUPNI_SLOZKA = KOREN / "build" / "exercise-media"


@dataclass
class Vysledek:
    hotovo: list[tuple[str, int]] = field(default_factory=list)  # (klic, kB)
    preskoceno: list[str] = field(default_factory=list)
    selhani: list[tuple[str, str]] = field(default_factory=list)  # (klic, duvod)


def nacti_mapovani(cesta: Path = MAPOVANI_SOUBOR) -> list[dict]:
    with cesta.open("r", encoding="utf-8") as f:
        return json.load(f)


def stahni(url: str) -> Image.Image:
    request = urllib.request.Request(url, headers={"User-Agent": "bmon-exercise-media-generator"})
    with urllib.request.urlopen(request, timeout=60) as odpoved:
        data = odpoved.read()
    return Image.open(io.BytesIO(data)).convert("RGB")


def zmensi(snimek: Image.Image) -> Image.Image:
    if snimek.width <= SIRKA:
        return snimek
    vyska = round(snimek.height * SIRKA / snimek.width)
    return snimek.resize((SIRKA, vyska), Image.LANCZOS)


def sjednot_rozmery(snimky: list[Image.Image]) -> list[Image.Image]:
    """Animovaný WebP vyžaduje, aby všechny rámy měly stejné rozměry. Free-exercise-db
    má u některých cviků (např. close_grip_ez_bar_press) dvě fotky v jiném poměru
    stran (portrét + krajina) — kratší rám se dorovná na bílé plátno velikosti
    toho většího, obraz zůstává beze změny."""
    sirka = max(s.width for s in snimky)
    vyska = max(s.height for s in snimky)
    vysledek = []
    for s in snimky:
        if s.size == (sirka, vyska):
            vysledek.append(s)
            continue
        platno = Image.new("RGB", (sirka, vyska), "white")
        platno.paste(s, ((sirka - s.width) // 2, (vyska - s.height) // 2))
        vysledek.append(platno)
    return vysledek


def sestav_animaci(fed_id: str) -> tuple[bytes, int]:
    """Stáhne dvě fotky cviku a slozi je do animovaneho WebP. Vraci (bajty, kB)."""
    snimky = sjednot_rozmery([zmensi(stahni(f"{RAW}/{fed_id}/{i}.jpg")) for i in (0, 1)])
    prvni, *zbytek = snimky
    buffer = io.BytesIO()
    prvni.save(
        buffer,
        format="WEBP",
        save_all=True,
        append_images=zbytek,
        duration=PRODLEVA_MS,
        loop=0,
        quality=KVALITA,
        method=6,
    )
    data = buffer.getvalue()
    return data, len(data) // 1024


def zpracuj_cvik(polozka: dict, dry_run: bool, force: bool, vysledek: Vysledek) -> None:
    klic = polozka["canonical_key"]
    fed_id = polozka["fed_id"]
    cesta = VYSTUPNI_SLOZKA / f"{klic}.webp"

    if cesta.exists() and not force:
        vysledek.preskoceno.append(klic)
        return

    if dry_run:
        print(f"[dry-run] {klic} <- {fed_id}")
        return

    try:
        data, kb = sestav_animaci(fed_id)
    except urllib.error.HTTPError as chyba:
        vysledek.selhani.append((klic, f"HTTP {chyba.code} pro {fed_id}"))
        return
    except urllib.error.URLError as chyba:
        vysledek.selhani.append((klic, f"sit: {chyba.reason}"))
        return
    except Exception as chyba:  # noqa: BLE001 - nespadnout na jednom cviku
        vysledek.selhani.append((klic, f"{type(chyba).__name__}: {chyba}"))
        return

    VYSTUPNI_SLOZKA.mkdir(parents=True, exist_ok=True)
    cesta.write_bytes(data)
    vysledek.hotovo.append((klic, kb))
    if kb > CIL_KB:
        print(f"  POZOR: {klic} má {kb} kB, cíl je ≤{CIL_KB} kB", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="jen vypsat, co by se stahovalo")
    parser.add_argument("--only", action="append", default=None, help="omezit na konkrétní canonical_key (lze víckrát)")
    parser.add_argument("--force", action="store_true", help="přepsat i cviky, které už mají výstupní soubor")
    parser.add_argument(
        "--mapovani-soubor",
        default=str(MAPOVANI_SOUBOR),
        help="cesta k mapování canonical_key -> fed_id (výchozí: skupina A)",
    )
    args = parser.parse_args()

    mapovani = nacti_mapovani(Path(args.mapovani_soubor))
    if args.only:
        pozadovane = set(args.only)
        mapovani = [p for p in mapovani if p["canonical_key"] in pozadovane]
        chybejici = pozadovane - {p["canonical_key"] for p in mapovani}
        if chybejici:
            print(f"Nejsou v tomhle mapování (možná jsou v jiné skupině): {', '.join(sorted(chybejici))}", file=sys.stderr)

    vysledek = Vysledek()
    for polozka in mapovani:
        zpracuj_cvik(polozka, args.dry_run, args.force, vysledek)

    print()
    print("=== SOUHRN ===")
    print(f"celkem ke zpracování: {len(mapovani)}")
    print(f"hotovo:               {len(vysledek.hotovo)}")
    print(f"přeskočeno (už bylo): {len(vysledek.preskoceno)}")
    print(f"selhalo:              {len(vysledek.selhani)}")

    if vysledek.hotovo:
        prumer = sum(kb for _, kb in vysledek.hotovo) / len(vysledek.hotovo)
        nad_cilem = [k for k, kb in vysledek.hotovo if kb > CIL_KB]
        print(f"průměrná velikost:    {prumer:.1f} kB")
        if nad_cilem:
            print(f"nad cílem {CIL_KB} kB:      {len(nad_cilem)} ({', '.join(nad_cilem)})")

    if vysledek.selhani:
        print("\n=== SELHÁNÍ ===")
        for klic, duvod in vysledek.selhani:
            print(f"  {klic}: {duvod}")

    return 1 if vysledek.selhani else 0


if __name__ == "__main__":
    raise SystemExit(main())
