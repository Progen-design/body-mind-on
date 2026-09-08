"""Overi poradi karet primo v nasazenem JS bundlu na produkci.

Stahne index.html z app.bodyandmindon.cz, najde hlavni JS chunk a porovna
poradi klicovych textu. Diky tomu se neda splest lokalni stav s tim, co
uzivatel opravdu dostane.
"""

from __future__ import annotations

import re
import urllib.request

ZAKLAD = "https://app.bodyandmindon.cz"

POSLOUPNOSTI = [
    ("Přehled", ["Jídelníček & Makra dnes", "Dnešní trénink", "Regenerace & spánek"]),
    ("Profil", ["Nastavené denní cíle", "Propojená chytrá zařízení"]),
]


def stahni(url: str) -> str:
    zadost = urllib.request.Request(url, headers={"User-Agent": "bmon-overeni/1.0"})
    with urllib.request.urlopen(zadost, timeout=60) as odpoved:
        return odpoved.read().decode("utf-8", errors="replace")


def main() -> int:
    html = stahni(f"{ZAKLAD}/")
    chunky = re.findall(r'src="(/assets/index-[^"]+\.js)"', html)
    if not chunky:
        print("NENALEZEN hlavni JS chunk v index.html")
        return 1

    cesta = chunky[0]
    print(f"bundle: {cesta}")
    js = stahni(f"{ZAKLAD}{cesta}")

    chyby = 0
    for nazev, texty in POSLOUPNOSTI:
        pozice = [(t, js.find(t)) for t in texty]
        chybejici = [t for t, i in pozice if i < 0]
        if chybejici:
            print(f"{nazev}: NENALEZENO {chybejici}")
            chyby += 1
            continue
        serazeno = all(pozice[i][1] < pozice[i + 1][1] for i in range(len(pozice) - 1))
        stav = "OK" if serazeno else "SPATNE"
        print(f"{nazev}: {stav}  " + "  ".join(f"{t}={i}" for t, i in pozice))
        chyby += 0 if serazeno else 1

    return 1 if chyby else 0


if __name__ == "__main__":
    raise SystemExit(main())
