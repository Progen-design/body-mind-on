/**
 * VÝBĚR POSTUPU RECEPTU — kdy uložený postup nestačí.
 *
 * PROČ. Pravidlo dosud znělo „skutečný postup vyhrává nad generickým“ a bralo
 * jakýkoli neprázdný postup. To je správně proti dosazování vaty typu „Připrav
 * suroviny podle seznamu“ — jenže část katalogu má postup sice skutečný, ale
 * kostrbatý:
 *
 *   „Vejce natvrdo s pečivem“ (coach_seed_v1, id 466)
 *     1. Uvař vejce natvrdo.
 *     2. Podávej s pečivem a zeleninou.
 *
 * Dva kroky bez času a množství. Zdroj `coach_seed_v1` má 150 receptů
 * s průměrem 2,9 kroku, zatímco kurátorovaná knihovna `simple_start` jich má
 * šest. Knihovna se ale nikdy nepoužila, protože uložený postup nebyl prázdný.
 *
 * CO TENHLE MODUL NEDĚLÁ: nevymýšlí kroky. Jen rozhodne, jestli sáhnout po
 * kurátorované verzi, když je uložená znatelně chudší. Když knihovna nic nemá,
 * zůstane uložený postup — dva strohé kroky jsou pořád lepší než vymyšlený
 * návod, jak něco uvařit.
 *
 * MODUL JE ČISTÝ — kvůli `node --test` bez transpilace.
 */

/** Pod tímhle počtem kroků považujeme postup za kostrbatý. */
export const MIN_KROKU_POSTUPU = 3;

/**
 * Kolik z toho je použitelný krok. Prázdné řetězce a jednoslovné útržky ne.
 *
 * @param {unknown} kroky
 * @returns {string[]}
 */
export function pouzitelneKroky(kroky) {
  if (!Array.isArray(kroky)) return [];
  return kroky
    .map((k) => String(k ?? '').trim())
    .filter((k) => k.length >= 3);
}

/**
 * Je uložený postup příliš chudý na to, aby stačil?
 *
 * @param {unknown} kroky
 * @returns {boolean}
 */
export function jePostupChudy(kroky) {
  return pouzitelneKroky(kroky).length < MIN_KROKU_POSTUPU;
}

/**
 * Který postup zobrazit.
 *
 * Pořadí: uložený, pokud není chudý → kurátorovaný z knihovny, pokud je
 * znatelně bohatší → uložený, i když je chudý → generovaný fallback.
 *
 * „Znatelně bohatší“ znamená aspoň o dva kroky víc. Bez toho by se postup
 * přepisoval sem a tam kvůli jednomu kroku navíc.
 *
 * @param {{ulozene?: unknown, knihovna?: unknown, fallback?: unknown}} vstup
 * @returns {{kroky: string[], zdroj: 'ulozeny'|'knihovna'|'fallback'}}
 */
export function vyberPostup({ ulozene, knihovna, fallback } = {}) {
  const u = pouzitelneKroky(ulozene);
  const k = pouzitelneKroky(knihovna);
  const f = pouzitelneKroky(fallback);

  if (u.length && !jePostupChudy(u)) return { kroky: u, zdroj: 'ulozeny' };
  if (k.length >= u.length + 2 && k.length >= MIN_KROKU_POSTUPU) return { kroky: k, zdroj: 'knihovna' };
  if (u.length) return { kroky: u, zdroj: 'ulozeny' };
  if (k.length) return { kroky: k, zdroj: 'knihovna' };
  return { kroky: f, zdroj: 'fallback' };
}
