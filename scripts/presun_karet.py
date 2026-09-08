"""Presun karet v profilu (jednorazovy skript, 9. 9. 2026).

1) ProfileSection: blok "Propojena chytra zarizeni & Data" jde uplne dolu -
   pro uzivatele to neni smerodatne, ma to byt az za cili a makry.
2) OverviewBentoGrid: karta "Jidelnicek & Makra dnes" (span 2) a "Dnesni
   trenink" (span 1) jdou na prvni radek, aby spolu vyplnily vsechny tri
   sloupce. "Regenerace & spanek" se posouva za ne.

Skript je idempotentni - kdyz uz je poradi spravne, nic nezmeni.
"""

from __future__ import annotations

import sys
from pathlib import Path

KOREN = Path(__file__).resolve().parent.parent


def vyrizni(text: str, zacatek: str, konec: str) -> tuple[str, str]:
    """Vrati (text bez bloku, blok). Blok je od `zacatek` do pred `konec`."""
    i = text.index(zacatek)
    j = text.index(konec, i)
    return text[:i] + text[j:], text[i:j]


def profil_dolu() -> bool:
    cesta = KOREN / "src" / "components" / "ProfileSection.tsx"
    text = cesta.read_text(encoding="utf-8")

    zacatek = "      {/* 3. Connected IoT Devices & Sync Status */}"
    konec = "      {/* 5. Cíle stravování, Maker & Životosprávy */}"
    patka = "\n    </div>\n  );"

    if text.index(zacatek) > text.index(konec):
        print("ProfileSection: uz je dole, preskakuji")
        return False

    zbytek, blok = vyrizni(text, zacatek, konec)
    komentar = (
        "      {/* PROPOJENÁ ZAŘÍZENÍ AŽ NA KONCI (9. 9. 2026).\n"
        "          Sekce seděla nad cíli a makry, ale pro uživatele není\n"
        "          směrodatná — většina žádné zařízení připojené nemá a viděla\n"
        "          tu jen dvě prázdné dlaždice. Data, která uživatel opravdu čte\n"
        "          (váha, BMI, cíle, makra), jsou teď nad ní. */}\n"
    )
    novy = zbytek.replace(patka, "\n" + komentar + blok.rstrip() + "\n" + patka, 1)
    if novy == zbytek:
        raise SystemExit("ProfileSection: nenasel jsem patku komponenty")

    cesta.write_text(novy, encoding="utf-8")
    print(f"ProfileSection: presunuto {len(blok.splitlines())} radku dolu")
    return True


def prehled_nahoru() -> bool:
    cesta = KOREN / "src" / "components" / "OverviewBentoGrid.tsx"
    text = cesta.read_text(encoding="utf-8")

    regenerace = "      {/* \n        ========================================================================\n        HERO METRIKA 2:"
    jidelnicek = "      {/* \n        ========================================================================\n        KARTA 3: Jídelníček & Makra dnes"
    konec_bloku = "      {/* KARTA \"AI Trenér TED\" ODSTRANĚNA 8. 9. 2026."

    if text.index(jidelnicek) < text.index(regenerace):
        print("OverviewBentoGrid: uz je nahore, preskakuji")
        return False

    zbytek, jidlo_a_trenink = vyrizni(text, jidelnicek, konec_bloku)
    komentar = (
        "      {/* JÍDELNÍČEK A TRÉNINK NA PRVNÍM ŘÁDKU (9. 9. 2026).\n"
        "          Span 2 + span 1 vyplní všechny tři sloupce, takže obojí sedí\n"
        "          vedle sebe hned nahoře. Dřív tu začínala Regenerace (span 1),\n"
        "          čímž se široký jídelníček zalomil na druhý řádek a trénink\n"
        "          spadl až pod něj. */}\n"
    )
    novy = zbytek.replace(regenerace, komentar + jidlo_a_trenink.rstrip() + "\n\n" + regenerace, 1)
    if novy == zbytek:
        raise SystemExit("OverviewBentoGrid: nenasel jsem kartu Regenerace")

    cesta.write_text(novy, encoding="utf-8")
    print(f"OverviewBentoGrid: presunuto {len(jidlo_a_trenink.splitlines())} radku nahoru")
    return True


def main() -> int:
    zmeneno = False
    for krok in (profil_dolu, prehled_nahoru):
        try:
            zmeneno |= krok()
        except ValueError as chyba:
            print(f"{krok.__name__}: NENALEZENO ({chyba})", file=sys.stderr)
            return 1
    return 0 if zmeneno or True else 1


if __name__ == "__main__":
    raise SystemExit(main())
