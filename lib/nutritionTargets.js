function asNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeGoal(goal) {
  const g = String(goal || '').toLowerCase().trim();
  if (g === 'redukce' || g === 'nabirani_svaly' || g === 'udrzovani') return g;
  return 'udrzovani';
}

function activityMultiplier(activity) {
  const value = String(activity || '').toLowerCase().trim();
  if (['velmi', 'very_active', 'active'].includes(value)) return 1.08;
  if (['stredne', 'moderate', 'light'].includes(value)) return 1.0;
  return 0.95;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * DOLNÍ LIMIT KALORICKÉHO CÍLE.
 *
 * ZJIŠTĚNÍ Z 13. 8. 2026: limit „ženy 1200 kcal, 0,8× BMR" v kódu NEEXISTOVAL.
 * Byl tu jen plochý `clamp(calories, 1200, 6000)` — pro ženy náhodou správný,
 * pro muže o dost nízký a na BMR nezávislý úplně. Dokud se cíl počítal jen při
 * registraci z ručně zadané váhy, moc to nevadilo. Jakmile se začne přepočítávat
 * z odvozené váhy, začne to vadit hodně: hubnoucí člověk dostává každý týden
 * nižší cíl a plochá podlaha ho nezastaví dřív než na 1200 kcal.
 *
 * Limit je proto max ze dvou věcí:
 *   1. absolutní minimum podle pohlaví (ženy 1200, muži 1500),
 *   2. 0,8 × BMR — škáluje s konkrétním člověkem, ne s tabulkou.
 *
 * BMR: Mifflin–St Jeor, standard pro tenhle účel.
 *
 * POZNÁMKA K MUŽSKÉ HODNOTĚ: zadání uvádělo výslovně jen ženských 1200.
 * 1500 pro muže je běžně používaný protějšek a je konzervativnější než
 * dosavadní stav, ale je to MŮJ předpoklad — potvrdit.
 */
export const MIN_KCAL_ZENA = 1200;
export const MIN_KCAL_MUZ = 1500;
/** Podíl BMR, pod který cíl nesmí klesnout. */
export const MIN_PODIL_BMR = 0.8;

/**
 * ODVOZENÍ KALORICKÉHO CÍLE Z TDEE, NE Z VÁHY — docs/DALSI_KROK.md 9.1/B1.
 *
 * Do 7. 9. 2026 se cíl počítal jako `váha × koeficient`, bez výšky, věku
 * nebo pohlaví — `bmrMifflinStJeor()` tu přitom už existovala, jen se
 * používala výhradně na dolní limit. Naměřeno: štíhlý vysoký muž v nabírání
 * dostal cíl o 251 kcal POD svým TDEE (hubnul by), zavalitý nízký člověk
 * v redukci dostal deficit skoro 1040 kcal (příliš agresivní).
 */
export const PODIL_TDEE_REDUKCE = 0.80;
export const PODIL_TDEE_NABIRANI = 1.10;

/**
 * FAKTORY AKTIVITY PRO TDEE — VLASTNÍ tabulka, ne `activityMultiplier()`.
 *
 * OPRAVA 7. 9. 2026 (první verze bodu B1 tohle měla špatně). `activityMultiplier()`
 * vrací 0,95/1,0/1,08 — to nejsou faktory fyzické aktivity, ale drobná korekce
 * vyladěná NA VÁHOVÝ VZOREC, kde velikost TDEE byla už schovaná v součinu
 * `váha × 30`. Násobit BMR číslem 0,95 dá výsledek POD bazálním metabolismem:
 * naměřeno na první verzi — žena 32 l., BMR 1449, "cíl na udržování" 1377 kcal.
 * To není udržování, to je hladovka, a dolní podlaha to nezachytí (1377 > 1200).
 * Skutečné faktory aktivity se pohybují mezi 1,2 a 1,9.
 *
 * `activityMultiplier()` zůstává beze změny — používá se dál v nouzové větvi
 * u váhového vzorce (chybí výška/věk), kde dává smysl.
 *
 * PROČ PRÁVĚ 1,55 U „STŘEDNĚ": `body_metrics.tdee` se dnes plní jako
 * BMR × 1,55 (ověřeno na pěti profilech, sedí na jednotku). Jiné číslo by
 * znamenalo, že uložené TDEE a nově odvozený cíl si začnou odporovat.
 */
export const FAKTOR_AKTIVITY_SEDAVY = 1.375;
export const FAKTOR_AKTIVITY_STREDNE = 1.55;
export const FAKTOR_AKTIVITY_VELMI = 1.725;

/** Neznámá/chybějící hodnota aktivity → stejný faktor jako „středně". */
function faktorAktivityTdee(activity) {
  const value = String(activity || '').toLowerCase().trim();
  if (['sedavy', 'lehce'].includes(value)) return FAKTOR_AKTIVITY_SEDAVY;
  if (['velmi', 'extra'].includes(value)) return FAKTOR_AKTIVITY_VELMI;
  return FAKTOR_AKTIVITY_STREDNE;
}

/**
 * MAKRA PODLE DIETY — docs/DALSI_KROK.md 9.1/A.
 *
 * Do 7. 9. 2026 byl podíl tuku na energii natvrdo 28 % bez ohledu na
 * `diet_type`. U nízkosacharidové diety to dávalo cíl 239 g sacharidů
 * (51 % energie) — přesně opak toho, co si člověk zvolil. Ostatní diety
 * (`vegetarian`, `gluten_free`, `lactose_free`) makrový rozpad neupravují,
 * nejsou to makrové diety (viz bod B2 — plánovač je u nich netrefuje z
 * jiného důvodu, řeší se měřením, ne tímhle rozpadem).
 *
 * PODÍL_SACHARIDU_LOW_CARB je střed zadaného rozmezí 20–25 % — konkrétní
 * číslo v zadání nebylo, tohle je MŮJ výběr v rámci něj, potvrdit.
 */
export const PODIL_SACHARIDU_LOW_CARB = 0.225;
export const PODIL_TUKU_VYCHOZI = 0.28;

function jeZena(gender) {
  const g = String(gender || '').toLowerCase().trim();
  return ['female', 'zena', 'žena', 'z', 'ž', 'f', 'w'].includes(g);
}

/**
 * Mifflin–St Jeor. Vrací null, když chybí vstup — dohadovat se výška ani věk
 * nesmí, protože z odhadu by vznikl limit, který nikoho nechrání.
 *
 * @returns {number|null}
 */
export function bmrMifflinStJeor({ weightKg, heightCm, age, gender } = {}) {
  const w = asNum(weightKg);
  const h = asNum(heightCm);
  const a = asNum(age);
  if (!(w > 0) || !(h > 0) || !(a > 0)) return null;
  const zaklad = 10 * w + 6.25 * h - 5 * a;
  return Math.round(zaklad + (jeZena(gender) ? -161 : 5));
}

/**
 * Dolní limit pro daného člověka. Platí pro KAŽDÝ výpočet cíle — registrační
 * i týdenní přepočet, protože obojí jde přes `calculateNutritionTargets`.
 *
 * @returns {{ limit: number, bmr: number|null, zaklad: number }}
 */
export function minimalniKalorickyCil({ weightKg, heightCm, age, gender } = {}) {
  const zaklad = jeZena(gender) ? MIN_KCAL_ZENA : MIN_KCAL_MUZ;
  const bmr = bmrMifflinStJeor({ weightKg, heightCm, age, gender });
  const zBmr = bmr === null ? 0 : Math.round(MIN_PODIL_BMR * bmr);
  return { limit: Math.max(zaklad, zBmr), bmr, zaklad };
}

function stableHash(input) {
  const text = JSON.stringify(input);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function calculateNutritionTargets({
  bodyMetrics = {},
  latestWithingsSummary = null,
  goal,
  activity,
  workoutDays = null,
  planAdjustmentSignal = null,
  forceRecalculate = false,
} = {}) {
  const normalizedGoal = normalizeGoal(goal ?? bodyMetrics?.goal);
  const weight = asNum(bodyMetrics?.weight_kg) ?? asNum(bodyMetrics?.weight) ?? 70;
  const registrationCalories = asNum(bodyMetrics?.calories_target);
  const activityMul = activityMultiplier(activity ?? bodyMetrics?.activity);
  const workoutDayCount = Array.isArray(workoutDays)
    ? workoutDays.length
    : asNum(bodyMetrics?.weekly_sessions_user) ?? asNum(bodyMetrics?.workouts_per_week) ?? 3;

  // BMR pro odvození cíle — STEJNÁ funkce jako u dolní hranice, jen jiné
  // volání. `null`, když chybí výška nebo věk; tady se to nedohaduje, jen se
  // spadne na starou váhovou heuristiku o pár řádků níž (docs/DALSI_KROK.md
  // 9.1/B1).
  const bmrProCil = bmrMifflinStJeor({
    weightKg: weight,
    heightCm: bodyMetrics?.height_cm,
    age: bodyMetrics?.age,
    gender: bodyMetrics?.gender,
  });

  let calories = 0;
  // Odvozujeme cíl, nebo přebíráme už uložený? Rozdíl rozhoduje o tom, jestli
  // se smí přičíst bonus za ≥5 tréninků — viz komentář u něj níž.
  let cilOdvozen = false;
  if (
    !forceRecalculate
    && registrationCalories != null
    && registrationCalories >= 1000
    && registrationCalories <= 6000
  ) {
    calories = Math.round(registrationCalories);
  } else if (bmrProCil !== null) {
    cilOdvozen = true;
    // Zaokrouhlit TDEE na celé číslo TADY, ne až po vynásobení podílem cíle —
    // jinak se rozejde s uloženým `body_metrics.tdee` (taky celé číslo) a
    // s ním i kontrolní čísla ze zadání o desítku kcal.
    const tdee = Math.round(bmrProCil * faktorAktivityTdee(activity ?? bodyMetrics?.activity));
    if (normalizedGoal === 'redukce') {
      calories = Math.round(tdee * PODIL_TDEE_REDUKCE);
    } else if (normalizedGoal === 'nabirani_svaly') {
      calories = Math.round(tdee * PODIL_TDEE_NABIRANI);
    } else {
      calories = tdee;
    }
  } else {
    // Bez výšky/věku nejde TDEE spočítat — stará váhová heuristika jako
    // nouzová cesta, ne jako výchozí chování. Musí být vidět v logu, protože
    // znamená, že cíl je horší kvalitou než u ostatních.
    console.warn('[nutritionTargets] BMR nedostupný (chybí výška nebo věk) — cíl se odvozuje z váhy, ne z TDEE', {
      goal: normalizedGoal,
    });
    cilOdvozen = true;
    if (normalizedGoal === 'redukce') {
      calories = Math.round((weight * 28 - 300) * activityMul);
    } else if (normalizedGoal === 'nabirani_svaly') {
      calories = Math.round((weight * 32 + 200) * activityMul);
    } else {
      calories = Math.round((weight * 30) * activityMul);
    }
  }

  // ULOŽENÁ MAKRA MAJÍ PŘEDNOST PŘED PŘEPOČTEM — STEJNĚ JAKO KALORIE.
  //
  // Do 23. 8. 2026 se makra nikdy neukládala a počítala se znovu při každém
  // volání. Bílkoviny vychází z váhy, takže s každou její změnou se posunuly
  // bílkoviny a jako zbytek i sacharidy. Změřeno na produkci: dva po sobě
  // jdoucí týdenní plány téhož člověka, oba na 2164 kcal, ale jednou
  // B 158 g / S 232 g a podruhé B 183 g / S 207 g. Jídelníček se pokaždé
  // skládal podle jiného cíle.
  //
  // Cíl výživy je rozhodnutí o člověku, ne mezivýsledek generátoru. Když ho
  // v `body_metrics` máme, přebírá se; přepočítá se jen při `forceRecalculate`
  // nebo když ho někdo vědomě mění (změna cíle, signál z plánu).
  const ulozeneMakro = {
    protein: asNum(bodyMetrics?.protein_target_g),
    carbs: asNum(bodyMetrics?.carbs_target_g),
    fat: asNum(bodyMetrics?.fat_target_g),
  };
  const maUlozenaMakra = !forceRecalculate
    && ulozeneMakro.protein > 0
    && ulozeneMakro.carbs > 0
    && ulozeneMakro.fat > 0;

  // MAKROVÝ ROZPAD PODLE DIETY — docs/DALSI_KROK.md 9.1/A. Jen `low_carb` je
  // makrová dieta a mění poměr; ostatní (`vegetarian`, `gluten_free`,
  // `lactose_free`) rozpad neupravují.
  const dietType = String(bodyMetrics?.diet_type || '').toLowerCase().trim();
  const jeLowCarb = dietType === 'low_carb';

  let protein = maUlozenaMakra
    ? Math.round(ulozeneMakro.protein)
    : Math.round(weight * (normalizedGoal === 'nabirani_svaly' ? 2.0 : normalizedGoal === 'redukce' ? 1.8 : 1.6));
  // U low_carb je tuk zbytek po bílkovinách a sacharidech — dopočte se níž,
  // spolu s finálními sacharidy (musí vycházet ze stejných, post-bonus
  // kalorií). U ostatních diet beze změny: fixní podíl energie z tuku.
  let fat = maUlozenaMakra
    ? Math.round(ulozeneMakro.fat)
    : jeLowCarb
      ? null
      : Math.round((calories * PODIL_TUKU_VYCHOZI) / 9);

  // BONUS ZA ≥5 TRÉNINKŮ SE PŘIČÍTÁ JEN PŘI ODVOZENÍ CÍLE.
  //
  // Kalorický cíl se PERSISTUJE do `body_metrics.calories_target` (registrace
  // ho tam zapíše hned po výpočtu), kdežto makra se nikdy neukládají a počítají
  // se znovu při každém volání. Dokud se `+100` přičítalo i ve větvi, která
  // uložený cíl jen přebírá, sčítalo se při každém průchodu znovu:
  //
  //   registrace   → vzorec + 100      → uloženo calories_target = 3699
  //   plán (makra) → 3699 + 100        → makra na 3799
  //   plán (cíl)   → 3799 + 100        → daily_calories 3899
  //
  // Změřeno 17.–18. 8. 2026 na třech účtech (25b7017a, profil A, živá
  // registrace přes Chrome): cíl 3699, makra 3799, deklarace 3899.
  // Spouštěčem NENÍ `activity='velmi'`, jak se zdálo z korelace — je to
  // `workoutDayCount >= 5`. Lidé s aktivitou „velmi“ jen typicky volí 5 tréninků.
  //
  // Proteinový bonus se přičítá jen tehdy, když se makra odvozují. Dřív byl
  // nepodmíněný, protože se makra neukládala a musela se dopočítat stejně při
  // každém volání. Jakmile se ukládají, platí u nich totéž co u kalorií:
  // uložená hodnota už bonus obsahuje a druhé přičtení by ji posunulo.
  if (workoutDayCount >= 5) {
    if (cilOdvozen) calories += 100;
    if (!maUlozenaMakra) protein += 5;
  }

  // Signál z plánu je vědomá změna cíle — ten se propíše i do uložených maker
  // a níž se zapíše zpátky do `body_metrics`.
  const shouldAdjust = planAdjustmentSignal?.should_adjust_next_plan === true;
  if (shouldAdjust) {
    calories += asNum(planAdjustmentSignal?.calorie_delta_next_plan) ?? 0;
    protein += asNum(planAdjustmentSignal?.protein_delta_g) ?? 0;
  }

  // Limit se počítá z TÉ VÁHY, ze které se počítal i cíl — u týdenního
  // přepočtu tedy z odvozené, ne z registrační. Jinak by podlaha patřila
  // někomu jinému než strop.
  const { limit: minKcal, bmr } = minimalniKalorickyCil({
    weightKg: weight,
    heightCm: bodyMetrics?.height_cm,
    age: bodyMetrics?.age,
    gender: bodyMetrics?.gender,
  });
  const predLimitem = Math.round(calories);
  calories = clamp(predLimitem, minKcal, 6000);
  const limitPouzit = calories > predLimitem;

  protein = clamp(Math.round(protein), 70, 320);
  let carbs;
  if (maUlozenaMakra && !shouldAdjust) {
    // Uložený poměr platí beze změny — dopočítat by znamenalo, že se s
    // každým posunem kalorií tiše mění to, co si člověk nastavil.
    fat = clamp(Math.round(fat), 35, 200);
    carbs = clamp(Math.round(ulozeneMakro.carbs), 40, 700);
  } else if (jeLowCarb) {
    // Sacharidy fixní podíl energie, tuk je zbytek — obráceně než u
    // ostatních diet (docs/DALSI_KROK.md 9.1/A).
    carbs = clamp(Math.round((calories * PODIL_SACHARIDU_LOW_CARB) / 4), 40, 700);
    fat = clamp(Math.round((calories - protein * 4 - carbs * 4) / 9), 35, 200);
  } else {
    // Sacharidy jsou zbytek energie po bílkovinách a tucích — současné
    // chování, beze změny.
    fat = clamp(Math.round(fat), 35, 200);
    carbs = clamp(Math.round((calories - protein * 4 - fat * 9) / 4), 40, 700);
  }

  const inputsForHash = {
    weight,
    goal: normalizedGoal,
    activity: activity ?? bodyMetrics?.activity ?? null,
    calories_target: registrationCalories,
    workout_days_count: workoutDayCount,
    withings_summary: latestWithingsSummary,
    plan_adjustment_signal: shouldAdjust ? planAdjustmentSignal : null,
  };

  return {
    calories_target: calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    source: 'body_metrics_withings_adjusted',
    /**
     * Odkud makra pocházejí. `ulozeny_cil` = přečteno z `body_metrics`,
     * `odvozeno` = spočítáno ze vzorce (registrace nebo vědomá změna cíle).
     * Volající podle toho pozná, jestli je má zapsat zpátky.
     */
    macros_source: maUlozenaMakra && !shouldAdjust ? 'ulozeny_cil' : 'odvozeno',
    calculated_at: new Date().toISOString(),
    inputs_hash: stableHash(inputsForHash),
    // Pro audit v `calorie_target_changes`: ať je zpětně vidět, že cíl
    // nedopadl podle vzorce, ale opřel se o dolní limit.
    floor_applied: limitPouzit,
    floor_value: minKcal,
    bmr,
  };
}
