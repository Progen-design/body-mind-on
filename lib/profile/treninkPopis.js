/**
 * CO TEN TRÉNINK VLASTNĚ JE — ODVOZENO Z CVIKŮ, NE VYMYŠLENO.
 *
 * Chyba, kterou to opravuje: plán ukazoval „Trénink B" a pod tím
 * „Fokus: Varianta B". To je tautologie — název opsaný jinými slovy.
 * Člověk, který si plán otevře poprvé, z toho nepozná, co bude cvičit,
 * ani proč se A a B střídají.
 *
 * Zaměření se proto skládá ze svalových skupin skutečných cviků v tom dni.
 * Zdrojem je `exercise_asset_registry.primary_muscle`, které do plánu
 * doplňuje `api/profile.js` (viz svalyDoPlanu.js). Nic se nedopočítává
 * a nic nevymýšlí: když u cviku svalová skupina chybí, do souhrnu se
 * nedostane.
 *
 * MODUL JE ČISTÝ JS — kvůli `node --test` bez transpilace a proto, že ho
 * importuje jak `src/data/adaptery.ts`, tak komponenty.
 */

/** Anglické klíče z `exercise_asset_registry.primary_muscle`. */
const SVALY_CS = {
  abs: 'břicho',
  back: 'záda',
  biceps: 'biceps',
  calves: 'lýtka',
  cardio: 'kondice',
  chest: 'hrudník',
  forearms: 'předloktí',
  glutes: 'hýždě',
  hamstrings: 'zadní stehna',
  lats: 'široký sval zádový',
  quads: 'přední stehna',
  shoulders: 'ramena',
  traps: 'trapézy',
  triceps: 'triceps',
  upperlegs: 'stehna',
};

/** Nářadí — `equipment_class` z téhož registru. */
const NARADI_CS = {
  barbell: 'velká činka',
  body_weight: 'vlastní váha',
  cable: 'kladka',
  dumbbell: 'jednoručky',
  kettlebell: 'kettlebell',
  machine: 'stroj',
  band: 'guma',
  none: 'bez nářadí',
};

/** Pořadí, ve kterém se svalové skupiny vypisují — odshora dolů po těle. */
const PORADI_SVALU = [
  'hrudník', 'záda', 'široký sval zádový', 'ramena', 'biceps', 'triceps',
  'předloktí', 'trapézy', 'břicho', 'hýždě', 'stehna', 'přední stehna',
  'zadní stehna', 'lýtka', 'kondice',
];

const NOHY = ['hýždě', 'stehna', 'přední stehna', 'zadní stehna', 'lýtka'];
const HORNI = ['hrudník', 'záda', 'široký sval zádový', 'ramena', 'biceps', 'triceps', 'trapézy'];

/**
 * @param {unknown} klic
 * @returns {string|null}
 */
export function svalCesky(klic) {
  const k = String(klic ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');
  return SVALY_CS[k] ?? null;
}

/**
 * @param {unknown} klic
 * @returns {string|null}
 */
export function naradiCesky(klic) {
  const k = String(klic ?? '').trim().toLowerCase().replace(/[\s-]/g, '_');
  return NARADI_CS[k] ?? null;
}

/**
 * Svalové skupiny, které trénink zabírá — v pořadí po těle, bez duplicit.
 *
 * @param {Array<{primary_muscle?: unknown}>} cviky cviky jednoho dne
 * @returns {string[]}
 */
export function svalyTreninku(cviky = []) {
  const nalezene = new Set();
  for (const cvik of Array.isArray(cviky) ? cviky : []) {
    const sval = svalCesky(cvik?.primary_muscle);
    if (sval) nalezene.add(sval);
  }
  return PORADI_SVALU.filter((s) => nalezene.has(s));
}

/**
 * Jednou větou, co ten trénink je.
 *
 * Když zabírá horní i dolní půlku těla, je to celotělový trénink — a to je
 * informace, kterou „Trénink B" neřekne.
 *
 * @param {Array<{primary_muscle?: unknown}>} cviky
 * @returns {string|null}
 */
export function zamereniTreninku(cviky = []) {
  const svaly = svalyTreninku(cviky);
  if (!svaly.length) return null;

  const maNohy = svaly.some((s) => NOHY.includes(s));
  const maHorni = svaly.some((s) => HORNI.includes(s));
  const vypis = svaly.join(', ');
  return maNohy && maHorni ? `Celé tělo — ${vypis}` : vypis;
}

/**
 * Nářadí, které si má člověk připravit.
 *
 * @param {Array<{equipment_class?: unknown}>} cviky
 * @returns {string[]}
 */
export function naradiTreninku(cviky = []) {
  const nalezene = new Set();
  for (const cvik of Array.isArray(cviky) ? cviky : []) {
    const n = naradiCesky(cvik?.equipment_class);
    if (n) nalezene.add(n);
  }
  return [...nalezene].sort((a, b) => a.localeCompare(b, 'cs'));
}

/**
 * „3 série po 8–10 opakováních" — rozepsaný zápis `3 × 8-10`.
 *
 * Zkratka je srozumitelná tomu, kdo posilovnu zná. Kdo v ní stojí poprvé,
 * potřebuje větu.
 *
 * @param {unknown} serie počet sérií
 * @param {unknown} opakovani text z plánu, např. „8-10" nebo „10-12 na stranu"
 * @returns {string|null}
 */
export function serieOpakovaniSlovy(serie, opakovani) {
  const s = Number(serie);
  const o = String(opakovani ?? '').trim();
  if (!Number.isFinite(s) || s <= 0 || !o) return null;

  const serieSlovo = s < 5 ? 'série' : 'sérií';
  const opakovaniText = o.replace(/(\d)\s*-\s*(\d)/, '$1–$2');
  // „30 s", „2 min" — výdrž na čas, ne opakování.
  const jeCas = /\d\s*(s|sek|min)\b/i.test(opakovaniText);
  return jeCas
    ? `${s} ${serieSlovo} po ${opakovaniText}`
    : `${s} ${serieSlovo} po ${opakovaniText} opakováních`;
}
