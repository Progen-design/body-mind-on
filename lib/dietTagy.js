/**
 * ODVOZENÉ DIETNÍ TAGY.
 *
 * PROČ. `gluten_free` a `low_carb` se do katalogu zapisovaly tak, jak je
 * vrátil model, a nic je neověřovalo — brána kontrolovala jen `vegan`
 * a `vegetarian`. Změřeno 24. 8. 2026: čtyři aktivní recepty označené jako
 * bezlepkové obsahovaly celozrnný chléb, toast nebo müsli.
 *
 * Obojí je přitom odvoditelné z dat:
 *   gluten_free — ze surovin, přes příznak `obsahuje_lepek` ve slovníku
 *   low_carb    — čistě z maker, žádný příznak nepotřebuje
 *
 * Autorita je databáze: brána `enforce_recipe_catalog_rules` oba tagy
 * PŘEPOČÍTÁVÁ při každém zápisu, takže se do katalogu nedostane tvrzení
 * modelu ani při přímém INSERTu mimo tenhle kód.
 *
 * K ČEMU JE TENHLE MODUL. Aby generátor nemusel čekat na odpověď z DB, když
 * chce vědět, jestli recept do objednávky sedí, a aby práh nežil jen v SQL.
 * Že se s migrací nerozešel, hlídá test v lib/__tests__/dietTagy.test.mjs.
 *
 * MODUL JE ČISTÝ — kvůli `node --test` bez transpilace.
 */

/**
 * Práh pro `low_carb`: podíl energie ze sacharidů.
 *
 * PROČ 0,26. Běžná klinická definice nízkosacharidové stravy. Změřeno
 * 24. 8. 2026, kolik aktivních receptů projde: snídaně 39, svačina 33,
 * oběd 56, večeře 73 — všude s velkou rezervou nad `MIN_RECEPTU_NA_SLOT`.
 *
 * Tag od modelu měl medián 13 %, ale devadesátý percentil 40 % a maximum
 * 91 %. Neznamenal tedy nic spolehlivého.
 *
 * Zrcadlí `je_low_carb()` v migraci 20260824120000.
 */
export const PRAH_LOW_CARB = 0.26;

/** Kolik kilokalorií nese gram sacharidů. */
const KCAL_NA_GRAM_SACHARIDU = 4;

/**
 * Podíl energie ze sacharidů, nebo null.
 *
 * Null znamená „nedá se spočítat“, ne nula — recept bez maker se za
 * nízkosacharidový nevydává.
 *
 * @param {number|null|undefined} kcal
 * @param {number|null|undefined} carbsG
 * @returns {number|null}
 */
export function podilSacharidu(kcal, carbsG) {
  // CHYBEJICI HODNOTA NENI NULA. `Number(null)` je 0, takze bez tehle
  // kontroly by recept s nevyplnenymi sacharidy vysel jako nulasacharidovy
  // a dostal tag `low_carb`. SQL to ma spravne (`p_carbs_g is null`), JS se
  // od nej timhle rozesel — chytil to test.
  if (kcal === null || kcal === undefined || kcal === '') return null;
  if (carbsG === null || carbsG === undefined || carbsG === '') return null;

  const k = Number(kcal);
  const c = Number(carbsG);
  if (!Number.isFinite(k) || k <= 0) return null;
  if (!Number.isFinite(c) || c < 0) return null;
  return (c * KCAL_NA_GRAM_SACHARIDU) / k;
}

/**
 * Je recept nízkosacharidový?
 *
 * Bez spočitatelného podílu vrací false — tag se přiděluje jen na základě
 * dat, ne při jejich absenci.
 *
 * @param {{kcal?: number, calories?: number, carbs_g?: number}} recept
 * @returns {boolean}
 */
export function jeLowCarb(recept) {
  const podil = podilSacharidu(recept?.kcal ?? recept?.calories, recept?.carbs_g);
  return podil !== null && podil <= PRAH_LOW_CARB;
}

/**
 * Tagy, které si recept nesmí určovat sám.
 *
 * Vrací se jako množina, aby šlo snadno zjistit, jestli se na tag smí
 * spoléhat, nebo se přepočítává.
 */
export const ODVOZENE_TAGY = Object.freeze(['gluten_free', 'low_carb']);

/**
 * Očistí tagy od modelu o ty, které se odvozují.
 *
 * Používá se před zápisem: co si model vymyslel o lepku nebo o sacharidech,
 * se zahodí a doplní z dat. Ostatní tagy (vegan, vegetarian, high_fiber…)
 * zůstávají — u nich je tag i rozhodnutí o zařazení, ne jen popis složení.
 *
 * @param {unknown} tagy
 * @returns {string[]}
 */
export function bezOdvozenychTagu(tagy) {
  if (!Array.isArray(tagy)) return [];
  const odvozene = new Set(ODVOZENE_TAGY);
  return tagy
    .map((t) => String(t ?? '').trim())
    .filter((t) => t.length > 0 && !odvozene.has(t));
}
