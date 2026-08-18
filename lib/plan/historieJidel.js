/**
 * ABY SE JEDNOMU ČLOVĚKU NEOPAKOVALA JÍDLA TÝDEN CO TÝDEN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CO SE DĚLO
 *
 * Účet janprikopa@gmail.com, dva po sobě jdoucí týdny (valid_from 2026-08-20
 * a 2026-08-27): z 35 jídel se opakovalo 27, tedy 77 %. Uvnitř jednoho týdne
 * přitom bylo všech 35 receptů různých — pestrost v rámci týdne funguje,
 * napříč týdny neexistovala vůbec.
 *
 * PŘÍČINA. Výběr slotu jde přes `pickFromTopKCatalogRow`, což je TOP-5 receptů
 * nejbližších kalorickému cíli slotu; `catalogPickSeed` pak jen permutuje uvnitř
 * té pětice. Cíl slotu se ale mezi týdny nemění, takže se každý týden nabízí
 * TÁŽ PĚTICE. Nešlo o chybu v míchání — nikde se nesledovalo, co ten člověk
 * dostal minule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CO SE NEŘEŠÍ
 *
 * Shoda jídel mezi RŮZNÝMI lidmi je v pořádku a záměrně se nehlídá. Tady jde
 * výhradně o časovou osu jednoho uživatele.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ZÁMĚRNÁ VOLBA UŽIVATELE JE VÝJIMKA
 *
 * Tlačítko „Zahrnout od dalšího týdne“ zapisuje do `user_meal_pins`. Co si
 * člověk vědomě připnul, se z historie NEVYLUČUJE — jinak by aplikace mlčky
 * přepsala jeho rozhodnutí a tlačítko by nedávalo smysl.
 */

/** Kolik týdnů zpět se jídla nenabízejí znovu. */
export const TYDNU_HISTORIE = 3;

/**
 * Recepty, které se pro tenhle týden nemají nabídnout znovu.
 *
 * @param {Array<string|number>} pouziteDrive catalog_id z předchozích plánů
 * @param {Array<string|number>} pripnute catalog_id, které si uživatel vyžádal
 * @returns {Set<string>} normalizované na string — catalog_id chodí z JSONB
 *                        jako text, z DB jako číslo, a `Set` je nesloučí
 */
export function vyluceniZHistorie(pouziteDrive, pripnute = []) {
  const pripnuteSet = new Set((pripnute || []).filter((v) => v != null).map(String));
  const out = new Set();
  for (const id of pouziteDrive || []) {
    if (id == null) continue;
    const klic = String(id);
    if (pripnuteSet.has(klic)) continue;
    out.add(klic);
  }
  return out;
}

/**
 * Vytáhne catalog_id ze `structured_plan_json` uloženého plánu.
 *
 * @param {{days?: Array<{meals?: Array<{catalog_id?: unknown}>}>}|null|undefined} structured
 * @returns {string[]}
 */
export function receptyZPlanu(structured) {
  const out = [];
  for (const den of structured?.days || []) {
    for (const m of den?.meals || []) {
      if (m?.catalog_id != null) out.push(String(m.catalog_id));
    }
  }
  return out;
}

/**
 * Od kdy brát historii. Vrací ISO datum (YYYY-MM-DD).
 *
 * @param {string|Date|null|undefined} validFrom začátek týdne, který se skládá
 * @param {number} [tydnu]
 * @returns {string|null}
 */
export function zacatekHistorie(validFrom, tydnu = TYDNU_HISTORIE) {
  if (!validFrom) return null;
  const d = new Date(validFrom);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - Math.max(1, Math.floor(tydnu)) * 7);
  return d.toISOString().slice(0, 10);
}
