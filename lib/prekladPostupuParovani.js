/**
 * lib/prekladPostupuParovani.js
 * Párování odpovědi modelu (JSON pole `exercises`) na řádky dávky podle id.
 *
 * exercise_asset_registry.id je UUID (ověřeno v information_schema:
 * data_type = 'uuid') — NESMÍ se přetypovávat na Number. `Number(uuid)` je
 * vždy NaN, takže `lib/prekladPostupuCviku.js` dřív zahodilo úplně každou
 * položku z odpovědi modelu: mapa zůstala prázdná, `kroky = []` u všech
 * deseti cviků v dávce, a tvrdá kontrola 1:1 to nahlásila jako "model
 * vrátil 0 kroků" — i když model odpověděl správně. Naměřeno v produkci:
 * `translated: 0, remaining: 183`, všech 10 řádků dávky se stejnou hláškou.
 *
 * Párování je teď řetězcové a normalizované (trim + lowercase), aby
 * fungovalo i když model UUID opíše s jinou velikostí písmen nebo
 * s mezerou navíc. Neznámé id (které v dávce není) se zahodí a zaloguje —
 * nikdy se nepřiřadí "nejbližšímu" řádku.
 */

/**
 * @param {unknown} id
 * @returns {string} '' pro null/undefined/prázdné
 */
export function normalizovatIdCviku(id) {
  return String(id ?? '').trim().toLowerCase();
}

/**
 * @param {Array<{ id: string }>} pending řádky dávky — zdroj pravdy pro platná id
 * @param {Array<{ id?: unknown, steps_cs?: unknown }>} exercisesZOdpovedi syrové pole z modelu
 * @returns {{ preklady: Map<string, string[]>, neznamaId: string[] }}
 *   `preklady` je klíčovaná NORMALIZOVANÝM id — lookup (krokyProRadek) musí
 *   normalizovat i stranu řádku. `neznamaId` jsou syrová id z odpovědi (ne
 *   normalizovaná — do logu patří přesně to, co model napsal), která
 *   v dávce nejsou.
 */
export function sparujOdpovedSDavkou(pending, exercisesZOdpovedi) {
  const platnaId = new Set((Array.isArray(pending) ? pending : []).map((r) => normalizovatIdCviku(r?.id)));

  /** @type {Map<string, string[]>} */
  const preklady = new Map();
  /** @type {string[]} */
  const neznamaId = [];

  for (const item of Array.isArray(exercisesZOdpovedi) ? exercisesZOdpovedi : []) {
    const suroveId = item?.id;
    const idNorm = normalizovatIdCviku(suroveId);
    if (!idNorm) continue;

    if (!platnaId.has(idNorm)) {
      // Model vrátil id, které v téhle dávce není — zahodí se. Nesmí se
      // přiřadit nejbližšímu/prvnímu řádku, to by mohlo zapsat cizí postup
      // k jinému cviku.
      neznamaId.push(String(suroveId));
      continue;
    }

    const kroky = Array.isArray(item?.steps_cs)
      ? item.steps_cs.map((s) => String(s || '').trim()).filter(Boolean)
      : [];
    preklady.set(idNorm, kroky);
  }

  return { preklady, neznamaId };
}

/**
 * Kroky pro daný řádek dávky. Normalizuje id na obou stranách, takže sedí
 * i UUID s jinou velikostí písmen nebo mezerou navíc, kterou model opsal.
 * @param {Map<string, string[]>} preklady z sparujOdpovedSDavkou
 * @param {string} rowId
 * @returns {string[]}
 */
export function krokyProRadek(preklady, rowId) {
  return preklady.get(normalizovatIdCviku(rowId)) || [];
}
