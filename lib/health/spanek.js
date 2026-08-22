/**
 * SPÁNEK Z APPLE HEALTH — CO SE DÁ UKÁZAT A CO NE.
 *
 * ZMĚŘENO NA PRODUKCI 22. 8. 2026 v `apple_health_raw_payloads`. Health Auto
 * Export posílá `sleep_analysis` v tomhle tvaru:
 *
 *   { "rem": 0, "core": 0, "deep": 0, "inBed": 0, "awake": 0.713,
 *     "asleep": 4.238, "totalSleep": 4.238,
 *     "sleepStart": "…", "sleepEnd": "…", "inBedStart": "…", "inBedEnd": "…" }
 *
 * 1. FÁZE SPÁNKU ZDROJ NEPOSÍLÁ. `rem`, `core` i `deep` chodí jako literální
 *    nula ve všech měřených nocích. Import je správně převádí na NULL
 *    (`apple_health_sleep.rem_min|core_min|deep_min` jsou null u obou
 *    existujících záznamů). „Hluboký spánek — (0 %)" v profilu tedy nebyla
 *    chyba importu, ale chyba zobrazení. Fáze se nezobrazují vůbec — ani
 *    jako „—". Zobrazit prázdný řádek pro něco, co nikdy nepřijde, je slib,
 *    který nemáme jak splnit.
 *
 * 2. ČAS V POSTELI A EFEKTIVITA JSOU DOPOČET Z NESMYSLNÉHO ÚDAJE. `inBed`
 *    je taky nula, takže `in_bed_min` vzniká ze span `inBedStart→inBedEnd`.
 *    U 15. 8. je `inBedEnd` 16:20 odpoledne: 705 minut v posteli proti 254
 *    minutám spánku a efektivita 36 %. To vypadá jako měření, ale měření to
 *    není. Nezobrazujeme.
 *
 * 3. CO ZŮSTÁVÁ. `asleep_min` (skutečně naměřeno), `awake_min` a časy
 *    usnutí/probuzení. To je vše, co o spánku víme.
 *
 * MODUL JE ČISTÝ — bez importů, kvůli `node --test` bez transpilace.
 */

/** Pole, která z `apple_health_sleep` čteme. Zbytek je dopočet nebo nula. */
export const SLOUPCE_SPANKU = 'local_date, sleep_start, sleep_end, asleep_min, awake_min, source';

function cislo(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Minuty na „7 h 12 min". `null` → `null`, ne „0 min".
 *
 * @param {number|null|undefined} minuty
 * @returns {string|null}
 */
export function trvaniSpanku(minuty) {
  const m = cislo(minuty);
  if (m === null || m < 0) return null;
  const hodin = Math.floor(m / 60);
  const zbytek = Math.round(m % 60);
  if (hodin === 0) return `${zbytek} min`;
  return zbytek === 0 ? `${hodin} h` : `${hodin} h ${zbytek} min`;
}

/**
 * Poslední noc, nebo `null`.
 *
 * Vrací `null` i tehdy, když záznam existuje, ale nemá naměřenou délku
 * spánku — bez ní není co ukázat a sekce se skryje.
 *
 * @param {Array<object>} radky řádky `apple_health_sleep`, libovolné pořadí
 * @returns {null | {
 *   datum: string,
 *   spanekMinut: number,
 *   spanek: string,
 *   probuzeniMinut: number|null,
 *   probuzeni: string|null,
 *   usnuti: string|null,
 *   probuzeniCas: string|null
 * }}
 */
export function posledniNoc(radky = []) {
  const pouzitelne = (radky || [])
    .filter((r) => cislo(r?.asleep_min) !== null && cislo(r?.asleep_min) > 0)
    .sort((a, b) => String(b.local_date || '').localeCompare(String(a.local_date || '')));

  if (pouzitelne.length === 0) return null;

  const noc = pouzitelne[0];
  const spanekMinut = cislo(noc.asleep_min);
  const probuzeniMinut = cislo(noc.awake_min);

  return {
    datum: String(noc.local_date || ''),
    spanekMinut,
    spanek: trvaniSpanku(spanekMinut),
    probuzeniMinut,
    probuzeni: trvaniSpanku(probuzeniMinut),
    usnuti: noc.sleep_start ? String(noc.sleep_start) : null,
    probuzeniCas: noc.sleep_end ? String(noc.sleep_end) : null,
  };
}
