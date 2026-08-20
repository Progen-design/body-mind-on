/**
 * VLASTNÍ JÍDLO — pravidlo pro denní součty.
 *
 * Uživatel si může do jídelníčku dopsat jídlo, které v plánu není. Takové jídlo
 * NEMÁ OVĚŘENOU NUTRICI: nevíme, co v něm je, ani kolik toho je.
 *
 * Proto se do denních součtů kalorií a maker započítá teprve tehdy, když
 * uživatel kalorie SÁM VYPLNÍ. Bez nich se ukáže v seznamu, viditelně odlišené,
 * ale do součtu nevstoupí — a součet o tom řekne, kolik jídel nezapočítal.
 *
 * Dopočítávat odhadem by znamenalo míchat měřená a hádaná čísla v jednom
 * součtu. To je táž chyba, kterou má hlídat metrika `complete` u nutrice
 * receptů (viz CLAUDE.md): číslo, které vypadá jako měření, ale není.
 *
 * NULA JE PLATNÁ HODNOTA. `kcal = 0` je „nula kalorií“ (čaj bez cukru) a
 * započítá se. `null` je „uživatel nevyplnil“ a nezapočítá se. `Number(null)`
 * je nula, takže prosté `Number(x) || 0` obě situace slije dohromady — proto
 * se tu všude testuje na null explicitně.
 *
 * MODUL JE ČISTÝ — kvůli `node --test` bez transpilace.
 */

/** @returns {number|null} */
function cisloNeboNull(hodnota) {
  if (hodnota === null || hodnota === undefined || hodnota === '') return null;
  const n = Number(hodnota);
  return Number.isFinite(n) ? n : null;
}

/**
 * Započítá se tohle vlastní jídlo do denního součtu?
 *
 * Rozhoduje jen vyplněná energie. Makra bez kalorií součet kalorií nezachrání
 * a naopak kalorie bez maker jsou pořád použitelný údaj o energii.
 *
 * @param {{kcal_rucne?: unknown}|null|undefined} jidlo
 * @returns {boolean}
 */
export function zapocitatDoSouctu(jidlo) {
  return cisloNeboNull(jidlo?.kcal_rucne) !== null;
}

/**
 * Denní součet z naplánovaných jídel a vlastních přídavků.
 *
 * Naplánovaná jídla chodí už spočítaná (mají nutrici z katalogu). Vlastní se
 * přidají jen ta s vyplněnou energií; zbytek se spočítá do `nezapocteno`, aby
 * UI mohlo říct „2 vlastní jídla bez kalorií se nepočítají“ místo aby to
 * zamlčelo.
 *
 * @param {{
 *   planovane?: {kcal?: number|null, protein?: number|null, carbs?: number|null, fat?: number|null},
 *   vlastni?: Array<object>,
 * }} vstup
 * @returns {{kcal: number|null, protein: number|null, carbs: number|null, fat: number|null,
 *            nezapocteno: number, zapocteno: number}}
 */
export function souctyDne({ planovane = {}, vlastni = [] } = {}) {
  const list = Array.isArray(vlastni) ? vlastni : [];
  const soucet = {
    kcal: cisloNeboNull(planovane?.kcal),
    protein: cisloNeboNull(planovane?.protein),
    carbs: cisloNeboNull(planovane?.carbs),
    fat: cisloNeboNull(planovane?.fat),
  };

  let nezapocteno = 0;
  let zapocteno = 0;

  for (const j of list) {
    if (!zapocitatDoSouctu(j)) {
      nezapocteno += 1;
      continue;
    }
    zapocteno += 1;
    const pridej = (klic, hodnota) => {
      const n = cisloNeboNull(hodnota);
      if (n === null) return;
      soucet[klic] = (soucet[klic] ?? 0) + n;
    };
    pridej('kcal', j.kcal_rucne);
    pridej('protein', j.protein_g);
    pridej('carbs', j.carbs_g);
    pridej('fat', j.fat_g);
  }

  return { ...soucet, nezapocteno, zapocteno };
}

/**
 * Věta pod denní součet o nezapočítaných jídlech, nebo null.
 *
 * @param {number} nezapocteno
 * @returns {string|null}
 */
export function popisNezapocteneho(nezapocteno) {
  const n = Number(nezapocteno) || 0;
  if (n <= 0) return null;
  const slovo = n === 1 ? 'vlastní jídlo' : n <= 4 ? 'vlastní jídla' : 'vlastních jídel';
  const sloveso = n === 1 ? 'se nepočítá' : 'se nepočítají';
  return `${n} ${slovo} bez zadaných kalorií ${sloveso} do součtu`;
}

export const MAX_DELKA_NAZVU = 120;

/**
 * Kontrola a očištění vstupu z formuláře „Přidat vlastní jídlo“.
 *
 * Vrací buď `{ ok: true, hodnota }`, nebo `{ ok: false, chyba }`. Nikdy nedosazuje
 * náhradní čísla — prázdné pole zůstane null, ne nula.
 *
 * @param {object} vstup
 * @returns {{ok: true, hodnota: object}|{ok: false, chyba: string}}
 */
export function overVlastniJidlo(vstup = {}) {
  const nazev = String(vstup.title ?? '').trim();
  if (!nazev) return { ok: false, chyba: 'Napiš název jídla.' };
  if (nazev.length > MAX_DELKA_NAZVU) return { ok: false, chyba: `Název může mít nejvýš ${MAX_DELKA_NAZVU} znaků.` };

  const datum = String(vstup.local_date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return { ok: false, chyba: 'Chybí den, ke kterému jídlo patří.' };

  const cisla = {};
  for (const [klic, popis] of [
    ['kcal_rucne', 'Kalorie'],
    ['protein_g', 'Bílkoviny'],
    ['carbs_g', 'Sacharidy'],
    ['fat_g', 'Tuky'],
  ]) {
    const n = cisloNeboNull(vstup[klic]);
    if (n === null) { cisla[klic] = null; continue; }
    if (n < 0) return { ok: false, chyba: `${popis} nemůžou být záporné.` };
    if (n > 10000) return { ok: false, chyba: `${popis} vypadají nesmyslně vysoko.` };
    cisla[klic] = n;
  }

  return {
    ok: true,
    hodnota: {
      title: nazev,
      local_date: datum,
      meal_type: vstup.meal_type ? String(vstup.meal_type).trim().slice(0, 40) : null,
      ...cisla,
    },
  };
}

export const MAX_DELKA_POLOZKY = 200;

/**
 * Kontrola vlastní položky nákupního seznamu. Prostý text, žádné parsování —
 * mapovat text na suroviny katalogu by znamenalo tiše měnit, co si uživatel
 * napsal.
 *
 * @param {unknown} text
 * @returns {{ok: true, hodnota: string}|{ok: false, chyba: string}}
 */
export function overPolozkuNakupu(text) {
  const t = String(text ?? '').trim();
  if (!t) return { ok: false, chyba: 'Napiš, co přidat na seznam.' };
  if (t.length > MAX_DELKA_POLOZKY) return { ok: false, chyba: `Položka může mít nejvýš ${MAX_DELKA_POLOZKY} znaků.` };
  return { ok: true, hodnota: t };
}
