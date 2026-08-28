/**
 * Audit normalizace surovin — čistá část, bez databáze.
 *
 * PROČ SAMOSTATNÝ MODUL. Cron `/api/cron/shopping-normalize-audit` dělá dvě
 * věci: posbírá názvy surovin z aktivních plánů a zeptá se slovníku, které
 * z nich nezná. To první je čistá funkce nad JSONem a jde otestovat; to druhé
 * patří do databáze (viz `suroviny_mimo_slovnik` v migraci 20260825090000).
 *
 * Dokud to bylo v jednom souboru s HTTP handlerem, netestovalo se ani jedno.
 */
import {
  collectShoppingIngredientRecordsFromMeals,
  parseShoppingIngredientRecord,
} from './shoppingListAggregate.js';

/**
 * Názvy surovin v aktivních plánech, po plánech.
 *
 * Vrací se `Map<planId, Set<nazev>>`, protože log je klíčovaný na dvojici
 * (raw_name, plan_id) — potřebujeme vědět, ve kterém plánu se surovina
 * objevila, ne jen že se objevila.
 *
 * @param {Array<{id: string, structured_plan_json?: {days?: Array<object>}}>} plany
 * @returns {Map<string, Set<string>>}
 */
export function nazvySurovinVPlanech(plany) {
  /** @type {Map<string, Set<string>>} */
  const podlePlanu = new Map();

  for (const plan of plany || []) {
    if (!plan?.id) continue;

    const dny = plan.structured_plan_json?.days || [];
    const jidla = dny.flatMap((d) => d?.meals || []);
    const zaznamy = collectShoppingIngredientRecordsFromMeals(jidla);

    const nazvy = new Set();
    for (const surovina of zaznamy) {
      const rozebrane = parseShoppingIngredientRecord(surovina);
      const nazev = String(rozebrane?.name ?? '').trim();
      if (nazev) nazvy.add(nazev);
    }

    if (nazvy.size > 0) podlePlanu.set(plan.id, nazvy);
  }

  return podlePlanu;
}

/**
 * Všechny názvy napříč plány, jednou. Vstup pro dotaz do slovníku.
 *
 * @param {Map<string, Set<string>>} podlePlanu
 * @returns {string[]}
 */
export function vsechnyNazvy(podlePlanu) {
  const vse = new Set();
  for (const nazvy of podlePlanu.values()) {
    for (const nazev of nazvy) vse.add(nazev);
  }
  return [...vse];
}

/**
 * Řádky k zápisu do `ingredient_normalization_misses`.
 *
 * Zapisuje se jen to, co slovník NEZNÁ. Do 25. 8. 2026 se sem dostávalo
 * i to, co zná — cron se ptal `resolveCanonicalName().matched`, což je
 * porovnání proti konstantě v `lib/ingredientAliasSeed.js` (74 klíčů),
 * ne proti slovníku v databázi (376 surovin, 503 aliasů). Odtud třináct
 * falešných poplachů, ve kterých byla bazalka i granola.
 *
 * @param {Map<string, Set<string>>} podlePlanu
 * @param {Set<string>} nezname názvy, které slovník nezná (odpověď z DB)
 * @param {string} kdy ISO timestamp běhu
 * @returns {Array<{plan_id: string, raw_name: string, seen_at: string}>}
 */
export function radkyKZapisu(podlePlanu, nezname, kdy) {
  const radky = [];

  for (const [planId, nazvy] of podlePlanu) {
    for (const nazev of nazvy) {
      if (!nezname.has(nazev)) continue;
      radky.push({ plan_id: planId, raw_name: nazev, seen_at: kdy });
    }
  }

  return radky;
}
