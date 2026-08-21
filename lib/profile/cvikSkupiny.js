/**
 * SESKUPENÍ CVIKŮ PODLE PARTIE — a ikona ke každému.
 *
 * PROČ. Sekce „Dnešní trénink“ vypisovala plochý seznam „název + série×opakování
 * + otazník“. U osmi cviků z toho nešlo poznat, co se vlastně trénuje ani jestli
 * je plán vyvážený.
 *
 * Partie i nářadí přitom v datech jsou: kanonický registr cviků
 * (`lib/exerciseCanonicalMap.js`) nese u každého cviku `body_part`, `target`
 * a `equipment`. Nic se tu nedopočítává ani neodhaduje — cvik bez záznamu
 * v registru spadne do skupiny „Ostatní“ a dostane neutrální ikonu.
 *
 * IKONA JE DEKORACE, NE INFORMACE. Nese ji vždycky doprovodný text (název
 * skupiny), takže kdo emoji nevidí, o nic nepřijde.
 *
 * MODUL JE ČISTÝ — kvůli `node --test` bez transpilace.
 */

/**
 * Partie z registru → český název a ikona.
 *
 * Klíče odpovídají hodnotám `body_part`, které registr skutečně obsahuje
 * (ověřeno: upper legs, chest, back, shoulders, waist, upper arms, full body).
 */
const PARTIE = Object.freeze({
  chest: { popisek: 'Hrudník', ikona: '🫀', poradi: 1 },
  back: { popisek: 'Záda', ikona: '🔙', poradi: 2 },
  shoulders: { popisek: 'Ramena', ikona: '🙆', poradi: 3 },
  'upper arms': { popisek: 'Paže', ikona: '💪', poradi: 4 },
  'upper legs': { popisek: 'Nohy', ikona: '🦵', poradi: 5 },
  waist: { popisek: 'Střed těla', ikona: '🧘', poradi: 6 },
  'full body': { popisek: 'Celé tělo', ikona: '🤸', poradi: 7 },
});

const OSTATNI = Object.freeze({ popisek: 'Ostatní', ikona: '🏋️', poradi: 99 });

/** Nářadí → ikona. Používá se u jednotlivého cviku, ne u skupiny. */
const NARADI = Object.freeze({
  'body weight': '🤸',
  barbell: '🏋️',
  dumbbell: '💪',
  cable: '🔗',
  'leverage machine': '⚙️',
});

/**
 * Skupina, do které cvik patří.
 *
 * @param {{body_part?: string}|null|undefined} zaznam — záznam z registru
 * @returns {{klic: string, popisek: string, ikona: string, poradi: number}}
 */
export function skupinaCviku(zaznam) {
  const bp = String(zaznam?.body_part ?? '').trim().toLowerCase();
  const s = PARTIE[bp];
  if (!s) return { klic: 'ostatni', ...OSTATNI };
  return { klic: bp, ...s };
}

/**
 * Ikona jednotlivého cviku — podle nářadí, jinak podle partie.
 *
 * @param {{body_part?: string, equipment?: string}|null|undefined} zaznam
 * @returns {string}
 */
export function ikonaCviku(zaznam) {
  const eq = String(zaznam?.equipment ?? '').trim().toLowerCase();
  if (NARADI[eq]) return NARADI[eq];
  return skupinaCviku(zaznam).ikona;
}

/**
 * Seskupí cviky podle partie, v pevném pořadí odshora dolů.
 *
 * Registr se předává jako funkce, aby modul zůstal čistý a testovatelný —
 * a aby existoval jediný zdroj názvů cviků, sdílený se zápisem tréninku.
 *
 * @param {Array<object>} cviky
 * @param {(klic: unknown) => object|null} najdiVRegistru
 * @returns {Array<{klic: string, popisek: string, ikona: string, cviky: Array<{cvik: object, ikona: string, index: number}>}>}
 */
export function seskupCviky(cviky, najdiVRegistru) {
  if (!Array.isArray(cviky) || cviky.length === 0) return [];
  const najdi = typeof najdiVRegistru === 'function' ? najdiVRegistru : () => null;

  /** @type {Map<string, {klic: string, popisek: string, ikona: string, poradi: number, cviky: object[]}>} */
  const mapa = new Map();

  cviky.forEach((cvik, index) => {
    const zaznam = najdi(cvik?.canonical_key) || null;
    const skupina = skupinaCviku(zaznam);
    if (!mapa.has(skupina.klic)) mapa.set(skupina.klic, { ...skupina, cviky: [] });
    mapa.get(skupina.klic).cviky.push({ cvik, ikona: ikonaCviku(zaznam), index });
  });

  return [...mapa.values()]
    .sort((a, b) => a.poradi - b.poradi)
    .map(({ poradi, ...zbytek }) => zbytek);
}

/**
 * Má smysl seznam vůbec dělit?
 *
 * U jedné skupiny by nadpis nad ní jen přidal řádek bez informace.
 *
 * @param {Array<object>} skupiny
 * @returns {boolean}
 */
export function stojiZaSeskupeni(skupiny) {
  return Array.isArray(skupiny) && skupiny.length >= 2;
}
