/**
 * ŘÁDEK SUROVINY PRO ZOBRAZENÍ — ze strukturovaných dat, ne z `original`.
 *
 * PROČ. Katalogová surovina nese `{ name, name_en, amount, unit, original }`.
 * Zobrazení dosud stavělo řádek z `original` — nepřeložené americké věty typu
 * „1/2 teaspoon chili powder“ — a pak z ní regexem vyškrtávalo imperiální
 * jednotky:
 *
 *   s.replace(/\b\d+(\.\d+)?\s*(oz|cups?|tsp|teaspoons?|…)\b/gi, '')
 *
 * U zlomku ale `\b` sedne i mezi „/“ a „2“, takže se z „1/2 teaspoon chili
 * powder“ vyhodilo „2 teaspoon“ a zbylo **„1/ chili powder“**. Uživatel viděl
 * useknutou frakci a neměl šanci poznat, kolik toho má dát.
 *
 * Řešení není lepší regex nad anglickou větou, ale nestavět z ní řádek vůbec:
 * `amount` a `unit` jsou v datech zvlášť a už normalizované (Spoonacular vrací
 * u většiny surovin gramy). `original` zůstává jen jako poslední záchrana,
 * když strukturovaná data chybí — a to už se nečistí, aby se past neopakovala.
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
 * Jednotky, které umíme pojmenovat česky.
 *
 * Tvary jsou tři: pro jedničku, pro 2–4 a pro zbytek (a pro zlomky se bere
 * druhý pád). Bez toho vzniká „2 lžička“ nebo „5 lžíce“.
 */
const JEDNOTKY = Object.freeze({
  tsp: { jedna: 'lžička', dva: 'lžičky', vic: 'lžiček', zlomek: 'lžičky' },
  tbsp: { jedna: 'lžíce', dva: 'lžíce', vic: 'lžic', zlomek: 'lžíce' },
  cup: { jedna: 'hrnek', dva: 'hrnky', vic: 'hrnků', zlomek: 'hrnku' },
  clove: { jedna: 'stroužek', dva: 'stroužky', vic: 'stroužků', zlomek: 'stroužku' },
  slice: { jedna: 'plátek', dva: 'plátky', vic: 'plátků', zlomek: 'plátku' },
  piece: { jedna: 'kus', dva: 'kusy', vic: 'kusů', zlomek: 'kusu' },
});

/** Jednotky, které se píšou zkratkou a neskloňují se. */
const ZKRATKY = new Set(['g', 'kg', 'ml', 'l', 'dl']);

/**
 * Normalizace názvu jednotky z API na náš klíč.
 *
 * Spoonacular posílá „tsps“, „Tbsps“, „teaspoons“ i prázdný řetězec.
 * @param {unknown} unit
 * @returns {{typ: 'zkratka'|'slovo'|'zadna', klic: string}}
 */
export function normalizujJednotku(unit) {
  const u = String(unit ?? '').trim().toLowerCase();
  if (!u) return { typ: 'zadna', klic: '' };

  if (ZKRATKY.has(u)) return { typ: 'zkratka', klic: u };
  if (u === 'grams' || u === 'gram') return { typ: 'zkratka', klic: 'g' };
  if (u === 'milliliters' || u === 'milliliter') return { typ: 'zkratka', klic: 'ml' };

  if (/^tsps?$|^teaspoons?$|^lžičk/.test(u)) return { typ: 'slovo', klic: 'tsp' };
  if (/^tbsps?$|^tablespoons?$|^lžíc/.test(u)) return { typ: 'slovo', klic: 'tbsp' };
  if (/^cups?$|^hrn/.test(u)) return { typ: 'slovo', klic: 'cup' };
  if (/^cloves?$|^strouž/.test(u)) return { typ: 'slovo', klic: 'clove' };
  if (/^slices?$|^plát/.test(u)) return { typ: 'slovo', klic: 'slice' };
  // „ks" je zkratka pro kus a v uložených plánech se objevuje obojí. Bez
  // tohohle by se „2 ks" a „2 kusy" v nákupním seznamu nesečetly.
  if (/^pieces?$|^kus|^ks$/.test(u)) return { typ: 'slovo', klic: 'piece' };

  // `serving` není jednotka množství, ale zástupný sentinel Spoonacularu
  // („Salt to taste“ → amount 1, unit serving). Nemá se zobrazovat jako číslo.
  if (/^servings?$|^porce?$/.test(u)) return { typ: 'zadna', klic: 'serving' };

  return { typ: 'zadna', klic: '' };
}

/** Zlomky, které se dají napsat jedním znakem — čitelnější než „0,5“. */
const ZLOMKY = Object.freeze([
  [0.25, '¼'], [0.33, '⅓'], [0.5, '½'], [0.66, '⅔'], [0.75, '¾'],
]);

/**
 * Množství česky. Celá čísla bez desetinné části, zlomky znakem, zbytek
 * na jedno desetinné místo s čárkou.
 *
 * @param {number} n
 * @returns {string}
 */
export function formatMnozstvi(n) {
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return String(n);

  // Spoonacular posílá i 40.541 — na gramy je desetina zbytečná přesnost.
  if (n >= 10) return String(Math.round(n));

  for (const [hodnota, znak] of ZLOMKY) {
    if (Math.abs(n - hodnota) < 0.02) return znak;
  }
  return n.toFixed(1).replace('.', ',');
}

/**
 * Tvar jednotky podle množství.
 *
 * @param {string} klic
 * @param {number} mnozstvi
 * @returns {string}
 */
export function tvarJednotky(klic, mnozstvi) {
  const j = JEDNOTKY[klic];
  if (!j) return '';
  // Desetinné číslo bere druhý pád jednotného čísla, stejně jako zlomek:
  // „2,7 lžíce", ne „2,7 lžic". Platí i pro čísla nad jedničku.
  if (mnozstvi < 1 || !Number.isInteger(mnozstvi)) return j.zlomek;
  if (mnozstvi === 1) return j.jedna;
  if (mnozstvi >= 2 && mnozstvi <= 4) return j.dva;
  return j.vic;
}

/**
 * Řádek suroviny pro zobrazení.
 *
 * @param {object|string} surovina
 * @returns {string}
 */
export function radekSuroviny(surovina) {
  if (typeof surovina === 'string') return surovina.trim();
  if (!surovina || typeof surovina !== 'object') return '';

  const nazev = String(surovina.name_cs || surovina.name || '').trim();
  const mnozstvi = cisloNeboNull(surovina.amount);
  const { typ, klic } = normalizujJednotku(surovina.unit);

  // Bez názvu nemá řádek smysl — spadneme na `original`, ale nečištěný.
  if (!nazev) return String(surovina.original || '').trim();

  // „Salt to taste“: sentinel `serving` u soli není množství.
  if (klic === 'serving' && /^(salt|sůl|pepper|pepř)$/i.test(nazev)) {
    return /^(salt|sůl)$/i.test(nazev) ? 'sůl dle chuti' : 'pepř dle chuti';
  }

  if (mnozstvi === null || mnozstvi <= 0) return nazev;

  const cislo = formatMnozstvi(mnozstvi);
  if (!cislo) return nazev;

  if (typ === 'zkratka') return `${cislo} ${klic} ${nazev}`;
  if (typ === 'slovo') return `${cislo} ${tvarJednotky(klic, mnozstvi)} ${nazev}`;
  return `${cislo}× ${nazev}`;
}

/**
 * Řádky pro celý recept.
 *
 * @param {Array<object|string>} suroviny
 * @returns {string[]}
 */
export function radkySurovin(suroviny) {
  if (!Array.isArray(suroviny)) return [];
  return suroviny.map(radekSuroviny).map((s) => s.trim()).filter(Boolean);
}
