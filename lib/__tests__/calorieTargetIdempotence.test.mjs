/**
 * Kalorický cíl musí být IDEMPOTENTNÍ — cíl = deklarace = makra.
 *
 * REGRESE Z 17.–18. 8. 2026. `calculateNutritionTargets` přičítala bonus
 * +100 kcal za ≥5 tréninků i ve větvi, která už uložený `calories_target`
 * jen přebírá. Cíl se přitom persistuje do `body_metrics`, kdežto makra se
 * počítají znovu při každém volání — číslo se tak nabalovalo:
 *
 *   registrace   → vzorec + 100   → uloženo 3699
 *   plán (makra) → 3699 + 100     → makra 3799
 *   plán (cíl)   → 3799 + 100     → daily_calories 3899
 *
 * Doloženo na třech účtech (25b7017a, testovací profil A, živá registrace
 * přes Chrome). Spouštěčem NENÍ `activity='velmi'`, jak vypadalo z korelace,
 * ale `workoutDayCount >= 5`; lidé s aktivitou „velmi“ jen typicky volí
 * pět tréninků. Test proto kryje obojí zvlášť.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNutritionTargets } from '../nutritionTargets.js';

const PET_DNU = ['1', '2', '3', '5', '6'];

/** Profil odpovídající živé Chrome registraci, na které se to změřilo. */
const PROFIL = {
  weight_kg: 95,
  height_cm: 188,
  age: 33,
  gender: 'male',
  goal: 'nabirani_svaly',
  activity: 'velmi',
};

function souctiMakra(t) {
  return t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9;
}

/**
 * PŘESNĚJI NEŽ NA 2 kcal TO NEJDE a není to vada.
 *
 * Makra se ukládají v celých gramech a sacharidy se počítají jako zbytek:
 * `carbs = round((calories - protein*4 - fat*9) / 4)`. Zaokrouhlení o 0,5 g
 * posune součet o 2 kcal. Naměřený rozchod, kvůli kterému test vznikl, byl
 * 100 a 200 kcal — o dva řády jinde.
 */
const TOLERANCE_KCAL = 2;

test('uložený cíl se opakovaným čtením nenafukuje (≥5 tréninků)', () => {
  // 1. průchod: cíl se odvozuje, bonus se započítá právě jednou.
  const prvni = calculateNutritionTargets({
    bodyMetrics: PROFIL, goal: PROFIL.goal, activity: PROFIL.activity, workoutDays: PET_DNU,
  });

  // 2. průchod: profil už cíl má (jako po registraci) — musí vyjít totéž.
  const sUlozenym = { ...PROFIL, calories_target: prvni.calories_target };
  const druhy = calculateNutritionTargets({
    bodyMetrics: sUlozenym, goal: PROFIL.goal, activity: PROFIL.activity, workoutDays: PET_DNU,
  });
  // 3. průchod: kdyby se bonus přičítal, tady už by byl +200.
  const treti = calculateNutritionTargets({
    bodyMetrics: { ...PROFIL, calories_target: druhy.calories_target },
    goal: PROFIL.goal, activity: PROFIL.activity, workoutDays: PET_DNU,
  });

  assert.equal(druhy.calories_target, prvni.calories_target, 'druhé čtení nafouklo cíl');
  assert.equal(treti.calories_target, prvni.calories_target, 'třetí čtení nafouklo cíl');
});

test('makra sedí na cíl (do 2 kcal zaokrouhlení) — activity velmi, 5 tréninků', () => {
  const t = calculateNutritionTargets({
    bodyMetrics: { ...PROFIL, calories_target: 3699 },
    goal: PROFIL.goal, activity: 'velmi', workoutDays: PET_DNU,
  });
  assert.equal(t.calories_target, 3699, 'cíl se nesmí od uloženého lišit');
  assert.ok(Math.abs(souctiMakra(t) - t.calories_target) <= TOLERANCE_KCAL,
    `makra ${souctiMakra(t)} vs cíl ${t.calories_target}`);
});

test('ostatní aktivity se chovají stejně — nic se neregresovalo', () => {
  for (const activity of ['sedavy', 'lehce', 'stredne', 'velmi', 'extra']) {
    for (const dnu of [PET_DNU, ['1', '3', '5']]) {
      const prvni = calculateNutritionTargets({
        bodyMetrics: PROFIL, goal: PROFIL.goal, activity, workoutDays: dnu,
      });
      const druhy = calculateNutritionTargets({
        bodyMetrics: { ...PROFIL, calories_target: prvni.calories_target },
        goal: PROFIL.goal, activity, workoutDays: dnu,
      });
      assert.equal(druhy.calories_target, prvni.calories_target,
        `${activity} / ${dnu.length} dnů: cíl se změnil při druhém čtení`);
      assert.ok(Math.abs(souctiMakra(druhy) - druhy.calories_target) <= TOLERANCE_KCAL,
        `${activity} / ${dnu.length} dnů: makra ${souctiMakra(druhy)} vs cíl ${druhy.calories_target}`);
    }
  }
});

test('bonus za ≥5 tréninků se pořád uplatní — jen právě jednou', () => {
  const petDnu = calculateNutritionTargets({
    bodyMetrics: PROFIL, goal: PROFIL.goal, activity: 'stredne', workoutDays: PET_DNU,
  });
  const triDny = calculateNutritionTargets({
    bodyMetrics: PROFIL, goal: PROFIL.goal, activity: 'stredne', workoutDays: ['1', '3', '5'],
  });
  assert.equal(petDnu.calories_target - triDny.calories_target, 100,
    'bonus za pátý trénink zmizel úplně');
});

test('forceRecalculate cíl přepočítá, ale taky jen s jedním bonusem', () => {
  const a = calculateNutritionTargets({
    bodyMetrics: { ...PROFIL, calories_target: 9999 },
    goal: PROFIL.goal, activity: 'velmi', workoutDays: PET_DNU, forceRecalculate: true,
  });
  const b = calculateNutritionTargets({
    bodyMetrics: { ...PROFIL, calories_target: a.calories_target },
    goal: PROFIL.goal, activity: 'velmi', workoutDays: PET_DNU,
  });
  assert.equal(b.calories_target, a.calories_target);
});
