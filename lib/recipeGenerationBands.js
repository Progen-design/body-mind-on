/**
 * KALORICKÁ PÁSMA OBJEDNÁVEK — srovnaná s tím, co generátor doopravdy umí.
 *
 * PROČ. Fronta si pásmo určovala volně a část kombinací byla nesplnitelná.
 * Změřeno na produkci 22. 8. 2026, co model u jednotlivých chodů skutečně
 * vyrábí (52 snídaní, 45 obědů, 124 večeří, 126 svačin z `llm_generated`):
 *
 *   chod      min   p10   medián   p90   max
 *   snídaně   255   306    392     516   542
 *   oběd      414   450    527     676   692
 *   večeře    202   300    469     648   855
 *   svačina   123   176    262     351   504
 *
 * A jak si vedly seed objednávky snídaní:
 *
 *   pásmo      položek  selhalo  hotovo
 *   300–550       4        1       3
 *   350–550       3        2       0
 *   400–550       3        2       0
 *
 * Každé pásmo se spodní hranicí od 350 výš skončilo bez jediného receptu.
 * Není divu — medián toho, co model u snídaně vytvoří, je 392 kcal, takže
 * pásmo „400–550“ vyžaduje horní polovinu rozdělení a model do něj trefí
 * sotva každý druhý pokus. Dávka pěti receptů pak neprojde ani jednou.
 *
 * CO TENHLE MODUL DĚLÁ: posune hranice objednávky do rozsahu, kde generátor
 * reálně tvoří. Nezmenšuje nároky na kvalitu — validace kcal zůstává tvrdá,
 * jen se přestane objednávat něco, co model nedodá.
 *
 * CO NEDĚLÁ: nesahá na validaci v `zapisRecept()`. Recept mimo pásmo se dál
 * zahazuje. Řeší se ZADÁNÍ, ne kontrola.
 *
 * MODUL JE ČISTÝ — kvůli `node --test` bez transpilace.
 */

/**
 * Dosažitelný rozsah podle chodu.
 *
 * `spodni_strop` = nejvyšší přípustná spodní hranice objednávky. Nad ní už
 * model trefuje míň než polovinu pokusů. Je odvozený z p10 zaokrouhleného
 * dolů — pod ním leží desetina produkce, což na dávku pěti receptů stačí.
 *
 * `horni_podlaha` = nejnižší přípustná horní hranice. Pod p90 by se zahazovaly
 * i povedené recepty.
 */
export const ROZSAHY_CHODU = Object.freeze({
  snidane: { spodni_strop: 300, horni_podlaha: 520 },
  obed: { spodni_strop: 450, horni_podlaha: 680 },
  vecere: { spodni_strop: 300, horni_podlaha: 650 },
  svacina: { spodni_strop: 170, horni_podlaha: 350 },
});

/** Minimální šířka pásma. Užší dávka je loterie i uvnitř rozdělení. */
export const MIN_SIRKA_PASMA = 200;

/**
 * KANONICKÉ PÁSMO SLOTU — jedno pásmo na chod, ne jedno na uživatele.
 *
 * PROČ. Fronta si pásmo brala z cíle konkrétního uživatele (`cil/2` až
 * `cil*2`), takže dvě skoro stejné poptávky založily dva řádky a unikát je
 * nespojil. Změřeno 25. 8. 2026: 100 otevřených položek pokrývalo jen
 * 17 kombinací (slot × dieta × bílkovinný hint) — tříštilo je VÝHRADNĚ
 * pásmo. A tříštilo je i nesmysly: svačina „50–2500 kcal" nebo snídaně
 * „912–1200 kcal", kterou model neumí (medián snídaně 392, maximum 542).
 *
 * Uživatelské pásmo v objednávce nedává smysl: katalog je SDÍLENÝ. Kolik
 * kalorií potřebuje konkrétní člověk, se rozhoduje až při skládání
 * jídelníčku, kde se porce škáluje. Objednávka má říkat „co model pro tenhle
 * chod umí vyrobit", a to je jedno číslo na chod.
 *
 * Odvozeno z `ROZSAHY_CHODU`, aby existoval jediný zdroj: spodní hranice je
 * `spodni_strop`, horní `horni_podlaha`, a pásmo se rozšíří na
 * `MIN_SIRKA_PASMA`, pokud je užší (týká se svačiny: 170–350 → 170–370).
 */
export const KANONICKA_PASMA = Object.freeze(
  Object.fromEntries(
    Object.entries(ROZSAHY_CHODU).map(([chod, r]) => {
      const min = r.spodni_strop;
      const max = Math.max(r.horni_podlaha, min + MIN_SIRKA_PASMA);
      return [chod, Object.freeze({ kcal_min: min, kcal_max: max })];
    }),
  ),
);

/**
 * Pásmo, které se má objednat pro daný chod.
 *
 * Vrací null u neznámého chodu — hádat rozsah pro něco, co jsme neměřili,
 * by bylo horší než nechat objednávku, jak přišla. Volající pak spadne zpátky
 * na `srovnejPasmo()`.
 *
 * @param {string} mealType
 * @returns {{kcal_min: number, kcal_max: number}|null}
 */
export function kanonickePasmo(mealType) {
  const chod = String(mealType || '').trim().toLowerCase();
  return KANONICKA_PASMA[chod] ?? null;
}

/**
 * Srovná objednané pásmo do rozsahu, ve kterém generátor tvoří.
 *
 * Vrací i `zmeneno` a `duvod`, aby šlo v logu poznat, že se zadání upravilo —
 * tichá úprava objednávky by byla horší než původní chyba.
 *
 * @param {{meal_type?: string, kcal_min?: unknown, kcal_max?: unknown}} objednavka
 * @returns {{kcal_min: number, kcal_max: number, zmeneno: boolean, duvod: string[]}}
 */
export function srovnejPasmo(objednavka = {}) {
  const chod = String(objednavka.meal_type || '').trim().toLowerCase();
  const rozsah = ROZSAHY_CHODU[chod];

  let min = Number(objednavka.kcal_min);
  let max = Number(objednavka.kcal_max);
  min = Number.isFinite(min) && min > 0 ? Math.round(min) : 0;
  max = Number.isFinite(max) && max > 0 ? Math.round(max) : 0;

  const duvod = [];

  // Neznámý chod nechává modul být — hádat rozsah pro něco, co jsme neměřili,
  // by bylo horší než nechat objednávku, jak přišla.
  if (!rozsah || !min || !max) {
    return { kcal_min: min, kcal_max: max, zmeneno: false, duvod };
  }

  const puvodniMin = min;
  const puvodniMax = max;

  if (min > rozsah.spodni_strop) {
    min = rozsah.spodni_strop;
    duvod.push(`spodni hranice ${puvodniMin} -> ${min} (${chod}: nad ni model netrefuje)`);
  }
  if (max < rozsah.horni_podlaha) {
    max = rozsah.horni_podlaha;
    duvod.push(`horni hranice ${puvodniMax} -> ${max} (${chod}: pod ni by se zahazovaly povedene recepty)`);
  }
  if (max - min < MIN_SIRKA_PASMA) {
    const puvodni = max;
    max = min + MIN_SIRKA_PASMA;
    duvod.push(`pasmo rozsireno na ${MIN_SIRKA_PASMA} kcal (${puvodni} -> ${max})`);
  }

  return { kcal_min: min, kcal_max: max, zmeneno: duvod.length > 0, duvod };
}

/**
 * Je pásmo objektivně nesplnitelné?
 *
 * Používá se k rozhodnutí, jestli má smysl objednávku vůbec pouštět —
 * a k hlášení, ne k tichému zahození.
 *
 * @param {{meal_type?: string, kcal_min?: unknown, kcal_max?: unknown}} objednavka
 * @returns {boolean}
 */
export function jePasmoNesplnitelne(objednavka = {}) {
  const chod = String(objednavka.meal_type || '').trim().toLowerCase();
  const rozsah = ROZSAHY_CHODU[chod];
  if (!rozsah) return false;
  const min = Number(objednavka.kcal_min);
  const max = Number(objednavka.kcal_max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
  // Celé pásmo leží nad tím, co model tvoří, nebo celé pod.
  return min > rozsah.horni_podlaha || max < rozsah.spodni_strop;
}
