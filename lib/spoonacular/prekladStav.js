/**
 * STAV PŘEKLADU RECEPTU — co ještě zbývá přeložit.
 *
 * PROČ TENHLE MODUL VZNIKL. `runCatalogRecipeTranslation` vybíral recepty
 * predikátem `.is('name_cs', null)` — tedy podle toho, jestli chybí přeložený
 * NÁZEV. Jenže překlad zapisuje tři věci: název, suroviny a postup. Jakmile
 * se povedl název, recept se z fronty ztratil navždy, i když suroviny zůstaly
 * anglicky.
 *
 * Změřeno na produkci 21. 8. 2026: 74 ze 183 spoonacularových receptů mělo
 * anglické suroviny, VŠECHNY z nich měly přeložený název, a fronta k překladu
 * byla prázdná — cron by k nim už nikdy nesáhl.
 *
 * K tomu druhá past: když model vrátil míň názvů surovin než jich recept má,
 * chybějící se tiše nahradily anglickým originálem a řádek se stejně uložil
 * jako přeložený. Částečná odpověď se tak zapsala jako hotová práce.
 *
 * MODUL JE ČISTÝ — kvůli `node --test` bez transpilace.
 */

/**
 * Je název suroviny pořád anglický?
 *
 * Překlad zapisuje češtinu do `name` a originál si odkládá do `name_en`.
 * Když se ty dva rovnají, překlad u téhle suroviny neproběhl. Surovina bez
 * `name_en` je z doby před zavedením překladu — tam se nedá poznat nic a
 * považuje se za nepřeloženou jen tehdy, když `name` chybí úplně.
 *
 * @param {unknown} surovina
 * @returns {boolean}
 */
export function jeSurovinaNeprelozena(surovina) {
  if (!surovina || typeof surovina !== 'object') return false;
  const name = String(surovina.name ?? '').trim();
  const nameEn = String(surovina.name_en ?? '').trim();
  if (!name) return true;
  if (!nameEn) return false;
  return name.toLowerCase() === nameEn.toLowerCase();
}

/**
 * Kolik surovin receptu zůstalo anglicky.
 *
 * @param {unknown} suroviny
 * @returns {number}
 */
export function pocetNeprelozenychSurovin(suroviny) {
  if (!Array.isArray(suroviny)) return 0;
  return suroviny.filter(jeSurovinaNeprelozena).length;
}

/**
 * Zbývá u tohohle receptu něco přeložit?
 *
 * Bere všechny tři výstupy překladu, ne jen název.
 *
 * @param {{name_cs?: unknown, ingredients?: unknown, instructions_cs?: unknown}} radek
 * @returns {boolean}
 */
export function zbyvaPrelozit(radek) {
  if (!radek || typeof radek !== 'object') return false;
  const nazevChybi = !String(radek.name_cs ?? '').trim();
  if (nazevChybi) return true;
  if (pocetNeprelozenychSurovin(radek.ingredients) > 0) return true;
  // `instructions_cs` je pole; prázdné znamená nepřeložený postup.
  const postup = radek.instructions_cs;
  if (Array.isArray(postup)) return postup.length === 0;
  return !String(postup ?? '').trim();
}

/**
 * Odpověď modelu pokrývá všechny suroviny?
 *
 * Když ne, překlad se NEZAPÍŠE. Doplnit chybějící anglickým originálem a řádek
 * přesto označit za hotový znamená ztratit ho z fronty s poloviční prací —
 * přesně to se stalo těm 74 receptům.
 *
 * @param {unknown} suroviny
 * @param {unknown} nazvyCs
 * @returns {{ok: boolean, chybi: number}}
 */
export function overPokrytiSurovin(suroviny, nazvyCs) {
  const celkem = Array.isArray(suroviny) ? suroviny.filter((i) => i && typeof i === 'object').length : 0;
  const dodano = Array.isArray(nazvyCs)
    ? nazvyCs.filter((n) => String(n ?? '').trim()).length
    : 0;
  if (celkem === 0) return { ok: true, chybi: 0 };
  return { ok: dodano >= celkem, chybi: Math.max(0, celkem - dodano) };
}
