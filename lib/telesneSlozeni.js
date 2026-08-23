/**
 * TĚLESNÉ SLOŽENÍ Z WITHINGS SNAPSHOTŮ.
 *
 * Withings ukládá tuk, svalovou hmotu, viscerální tuk, BMI i bazální
 * metabolismus do `withings_body_snapshots`. Do 22. 8. 2026 tu tabulku
 * nečetl nikdo — `api/profile.js` ji vůbec nedotazoval — a karta proto
 * ukazovala 0 %, jako by změřená hodnota byla nula.
 *
 * PRÁZDNÉ SNAPSHOTY EXISTUJÍ. Withings posílá i skupiny bez tělesných metrik
 * (změřeno: 2026-08-20 18:03 má všechny sloupce null). Takový řádek není
 * měření složení, jen záznam skupiny — nesmí přebít poslední skutečná data.
 *
 * NULA NENÍ CHYBĚJÍCÍ HODNOTA. Chybí-li metrika, vrací se `null` a UI kreslí
 * „—". Nula by tvrdila, že jsme naměřili nulu.
 *
 * MODUL JE ČISTÝ — bez importů, aby šel spustit i node --test bez transpilace.
 */

/**
 * Metriky, které z tabulky bereme.
 *
 * Naměřeno 22. 8. 2026 na 40 řádcích: `fat_mass_kg`, `bone_mass_kg`
 * a `hydration_kg` mají hodnotu u 36 z nich, stejně jako tuk v procentech
 * a svalová hmota — chytrá váha je posílá vždycky spolu. Profil je do 3.10
 * zahazoval, přestože v databázi ležely.
 *
 * `hydration_percent` chybí schválně: je null ve všech 40 řádcích, takže by
 * šlo o prázdný sloupec navíc. `pulse` má hodnotu jen ve 2 řádcích a do
 * složení těla nepatří — tep vozí hodinky.
 */
export const METRIKY_SLOZENI = [
  'fat_percent',
  'fat_mass_kg',
  'muscle_mass_kg',
  'visceral_fat',
  'bmi',
  'basal_metabolic_rate',
  'bone_mass_kg',
  'hydration_kg',
];

/**
 * Sloupce pro `.select()` v `api/profile.js`. Odvozené, ne psané ručně —
 * ručně psaný seznam se s `METRIKY_SLOZENI` tiše rozejde a metrika pak
 * v UI navždy svítí „—", přestože v databázi hodnotu má.
 */
export const SLOUPCE_SNAPSHOTU = ['measured_at', ...METRIKY_SLOZENI].join(', ');

function cislo(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Skupina bez jediné tělesné metriky. Není to měření složení. */
export function jePrazdnySnapshot(radek) {
  if (!radek) return true;
  return METRIKY_SLOZENI.every((k) => cislo(radek[k]) === null);
}

function naMetriky(radek) {
  const out = {};
  for (const k of METRIKY_SLOZENI) out[k] = cislo(radek[k]);
  return out;
}

/**
 * Rozdíl dvou měření. `null`, když kterákoli strana chybí — dopočítávat
 * deltu proti neznámé hodnotě znamená vymyslet si ji.
 */
function rozdil(ted, drive) {
  if (ted === null || drive === null) return null;
  return Math.round((ted - drive) * 100) / 100;
}

/**
 * Poslední neprázdný snapshot a změna proti předchozímu neprázdnému.
 *
 * @param {object[]} radky snapshoty, libovolné pořadí
 * @returns {null | {
 *   measured_at: string,
 *   fat_percent: number|null, muscle_mass_kg: number|null, visceral_fat: number|null,
 *   bmi: number|null, basal_metabolic_rate: number|null, bone_mass_kg: number|null,
 *   predchozi_measured_at: string|null,
 *   zmena: Record<string, number|null>
 * }}
 */
export function vyberTelesneSlozeni(radky = []) {
  const neprazdne = (radky || [])
    .filter((r) => r?.measured_at && !jePrazdnySnapshot(r))
    .sort((a, b) => Date.parse(b.measured_at) - Date.parse(a.measured_at));

  if (neprazdne.length === 0) return null;

  const aktualni = neprazdne[0];
  const predchozi = neprazdne[1] || null;

  const ted = naMetriky(aktualni);
  const drive = predchozi ? naMetriky(predchozi) : null;

  const zmena = {};
  for (const k of METRIKY_SLOZENI) {
    zmena[k] = drive ? rozdil(ted[k], drive[k]) : null;
  }

  return {
    measured_at: String(aktualni.measured_at),
    ...ted,
    predchozi_measured_at: predchozi ? String(predchozi.measured_at) : null,
    zmena,
  };
}
