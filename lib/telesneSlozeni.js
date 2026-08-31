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
 * MODUL SKORO NEMÁ IMPORTY, aby šel spustit i node --test bez transpilace.
 * Výjimka je `lib/bmi.js` — taky bez závislostí (žádný supabaseServer.js),
 * takže bezpečný i tady.
 *
 * BMI SE POČÍTÁ TADY, NE Z `withings_body_snapshots.bmi`.
 *
 * Withings počítá BMI z výšky, kterou má nastavenou U SEBE — ne z
 * `body_metrics.height_cm`. Změřeno 31. 8. 2026: appka měla do 30. 8. ve
 * Withings i u sebe 182 cm, po opravě výšky (6.5) appka 194 cm, Withings
 * zůstal na starém čísle. Stejná trajektorie váhy pak v grafu BMI ukazovala
 * pokles o 3,5 bodu z jednoho dne na druhý — zlepšení, které se nestalo.
 * Appka si BMI proto počítá sama, z JEDNÉ (aktuální) výšky napříč celou
 * historií — graf je tak srovnatelný sám se sebou (docs/DALSI_KROK.md 7.2d).
 */
import { calculateBmi } from './bmi.js';

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
 *
 * `weight_kg` navíc, mimo `METRIKY_SLOZENI` — potřebuje ho jen přepočet BMI
 * níž, nejde o vlastní zobrazovanou metriku téhle sady (váha se ukazuje
 * z jiného zdroje, `body_measurements` přes `naVazeni()`).
 */
export const SLOUPCE_SNAPSHOTU = ['measured_at', 'weight_kg', ...METRIKY_SLOZENI].join(', ');

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

/**
 * `heightCm` je JEDNA aktuální výška (`body_metrics.height_cm`), použitá pro
 * BMI všech měření stejně — ne výška, kterou měl Withings nastavenou ten
 * který den. Bez ní (`null`) BMI vyjde `null`, ne z nesprávné výšky.
 */
function naMetriky(radek, heightCm) {
  const out = {};
  for (const k of METRIKY_SLOZENI) {
    out[k] = k === 'bmi' ? calculateBmi(cislo(radek.weight_kg), heightCm) : cislo(radek[k]);
  }
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
 * KRATŠÍ ROZESTUP MEZI MĚŘENÍMI NEŽ TENHLE PRÁH JE ŠUM IMPEDANCE, NE ZMĚNA
 * SLOŽENÍ TĚLA.
 *
 * Změřeno 31. 8. 2026: měření 21 h od sebe (30. 8. 22:43 → 31. 8. 19:17)
 * ukázala +3,4 kg svalové hmoty a −1,8 % tuku „za den". V historii přitom
 * svalová hmota kolísá mezi 81,3 a 92 kg jen podle hydratace — impedanční
 * váha neváží svaly, odhaduje je z elektrického odporu těla, který se mění
 * v řádu hodin. Pod prahem se `zmena` u všech metrik nepočítá vůbec — appka
 * tak neříká jako fakt číslo, které tenhle rozestup neunese
 * (docs/DALSI_KROK.md 7.2f). Nekomentuje se to, prostě to nesvítí.
 */
const MIN_HODIN_MEZI_MERENIMI_PRO_ZMENU = 72;

function hodinMezi(a, b) {
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return Math.abs(t1 - t2) / 3_600_000;
}

/**
 * Poslední neprázdný snapshot a změna proti předchozímu neprázdnému.
 *
 * @param {object[]} radky snapshoty, libovolné pořadí
 * @param {number|null} [heightCm] aktuální výška pro přepočet BMI (viz `naMetriky`)
 * @returns {null | {
 *   measured_at: string,
 *   fat_percent: number|null, muscle_mass_kg: number|null, visceral_fat: number|null,
 *   bmi: number|null, basal_metabolic_rate: number|null, bone_mass_kg: number|null,
 *   predchozi_measured_at: string|null,
 *   zmena: Record<string, number|null>
 * }}
 */
export function vyberTelesneSlozeni(radky = [], heightCm = null) {
  const neprazdne = (radky || [])
    .filter((r) => r?.measured_at && !jePrazdnySnapshot(r))
    .sort((a, b) => Date.parse(b.measured_at) - Date.parse(a.measured_at));

  if (neprazdne.length === 0) return null;

  const aktualni = neprazdne[0];
  const predchozi = neprazdne[1] || null;

  const ted = naMetriky(aktualni, heightCm);
  const drive = predchozi ? naMetriky(predchozi, heightCm) : null;

  const rozestupHodin = predchozi ? hodinMezi(aktualni.measured_at, predchozi.measured_at) : null;
  const dostatecnyRozestup = rozestupHodin !== null && rozestupHodin >= MIN_HODIN_MEZI_MERENIMI_PRO_ZMENU;

  const zmena = {};
  for (const k of METRIKY_SLOZENI) {
    zmena[k] = drive && dostatecnyRozestup ? rozdil(ted[k], drive[k]) : null;
  }

  return {
    measured_at: String(aktualni.measured_at),
    ...ted,
    predchozi_measured_at: predchozi ? String(predchozi.measured_at) : null,
    zmena,
  };
}
