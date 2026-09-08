"""Jidelnicek + trenink na prvni radek prehledu (jednorazovy skript).

Karta "Jidelnicek & Makra dnes" ma lg:col-span-2 a "Dnesni trenink"
lg:col-span-1 - spolu presne vyplni tri sloupce. Drive pred nimi stala
"Regenerace & spanek" (span 1), takze siroky jidelnicek se zalomil na
druhy radek a trenink spadl az pod nej.

Skript je idempotentni.
"""

from __future__ import annotations

from pathlib import Path

CESTA = Path(__file__).resolve().parent.parent / "src" / "components" / "OverviewBentoGrid.tsx"

ZNACKA_REGENERACE = "HERO METRIKA 2"
ZNACKA_JIDELNICEK = "KARTA 3: J"
ZNACKA_ZA_TRENINKEM = "ODSTRANĚNA 8. 9. 2026"

KOMENTAR = """      {/* JÍDELNÍČEK A TRÉNINK NA PRVNÍM ŘÁDKU (9. 9. 2026).
          Span 2 + span 1 vyplní všechny tři sloupce, takže obojí sedí vedle
          sebe hned nahoře. Dřív tu začínala Regenerace (span 1), čímž se
          široký jídelníček zalomil na druhý řádek a trénink spadl pod něj. */}
"""


def zacatek_bloku(text: str, znacka: str) -> int:
    """Index zacatku JSX komentare, ve kterem znacka lezi."""
    i = text.index(znacka)
    j = text.rfind("{/*", 0, i)
    if j < 0:
        raise ValueError(f"komentar pred {znacka!r} nenalezen")
    return text.rfind("\n", 0, j) + 1


def main() -> int:
    text = CESTA.read_text(encoding="utf-8")

    i_regenerace = zacatek_bloku(text, ZNACKA_REGENERACE)
    i_jidelnicek = zacatek_bloku(text, ZNACKA_JIDELNICEK)
    i_konec = zacatek_bloku(text, ZNACKA_ZA_TRENINKEM)

    if i_jidelnicek < i_regenerace:
        print("uz je nahore, preskakuji")
        return 0
    if not i_regenerace < i_jidelnicek < i_konec:
        raise SystemExit("neocekavane poradi karet, nic nemenim")

    blok = text[i_jidelnicek:i_konec]
    zbytek = text[:i_jidelnicek] + text[i_konec:]
    novy = zbytek[:i_regenerace] + KOMENTAR + blok.rstrip() + "\n\n" + zbytek[i_regenerace:]

    CESTA.write_text(novy, encoding="utf-8")
    print(f"presunuto {len(blok.splitlines())} radku nahoru")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
