// Pokrok váhy pro ukazatel „Váha" v hero — PROMPT_DNES_HERO.md.
//
// pruh pokroku = (start − aktuální) / (start − cíl), start = první záznam,
// aktuální = poslední. Funguje pro hubnutí (start > cíl) i nabírání
// (cíl > start) — vzorec je na směru nezávislý.
export interface VahovyZaznam {
  weight: number;
}

export interface VahovyPokrok {
  aktualniKg: number | null;
  cilKg: number | null;
  /** |aktuální − cíl|, zaokrouhleno na 0,1 kg. `null` bez cíle nebo záznamu. */
  zbyvaKg: number | null;
  smer: 'hubnuti' | 'nabirani' | null;
  /**
   * 0..1, VŽDY oříznuto do rozsahu (přestřelení cíle nesmí dát zápornou ani
   * přes 100% širokou lištu). `null` = pruh se NEKRESLÍ (méně než 2 záznamy
   * nebo chybějící cíl) — volající pak ukáže jen čísla.
   */
  podilPokroku: number | null;
}

export function vypocitejVahovyPokrok(
  zaznamy: VahovyZaznam[],
  cilKg: number | null | undefined
): VahovyPokrok {
  const posledni = zaznamy.length > 0 ? zaznamy[zaznamy.length - 1] : null;
  const aktualniKg = posledni ? posledni.weight : null;
  const cil = cilKg != null && cilKg > 0 ? cilKg : null;

  if (aktualniKg == null) {
    return { aktualniKg: null, cilKg: cil, zbyvaKg: null, smer: null, podilPokroku: null };
  }

  const zbyvaKg = cil != null ? Math.round(Math.abs(aktualniKg - cil) * 10) / 10 : null;
  const smer: VahovyPokrok['smer'] =
    cil == null || aktualniKg === cil ? null : aktualniKg > cil ? 'hubnuti' : 'nabirani';

  // Míň než 2 záznamy nebo chybějící cíl → jen čísla, žádný pruh.
  if (zaznamy.length < 2 || cil == null) {
    return { aktualniKg, cilKg: cil, zbyvaKg, smer, podilPokroku: null };
  }

  const start = zaznamy[0].weight;
  if (start === cil) {
    // Cíl == výchozí bod: „pokrok" nemá vzhledem k čemu se poměřit.
    // Když se odtud aktuální váha nepohnula, je to hotovo (1); jinak
    // radši žádné číslo než dělení nulou.
    return { aktualniKg, cilKg: cil, zbyvaKg, smer, podilPokroku: aktualniKg === cil ? 1 : null };
  }

  const podil = (start - aktualniKg) / (start - cil);
  const podilPokroku = Math.max(0, Math.min(1, podil));
  return { aktualniKg, cilKg: cil, zbyvaKg, smer, podilPokroku };
}
