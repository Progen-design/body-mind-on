/**
 * ZÁMĚNA JÍDLA NESMÍ VRÁTIT TOTÉŽ JÍDLO — produkční nález, PR #233.
 *
 * PROČ TENHLE TEST EXISTUJE. `POST /api/plan-replace-meal` vracelo HTTP 200
 * „ok" i tehdy, když nahradilo jídlo sebou samým. `buildReplacementStructuredMeal()`
 * vybralo správně JINOU položku ("Tvaroh s vločkami a banánem"), ale ta
 * v `SIMPLE_START_RECIPES` nemá recept (14 ze 60 šablon v `START_MEAL_TEMPLATES`
 * je bez knihovního receptu, naměřeno) — `resolveSimpleStartLocalSlot()` ji
 * proto cestou zahodila a propadla do `buildStartSafeFallbackMeal()`, která
 * vybírala NEZÁVISLE na tom, co se nahrazuje. U standard/breakfast s cílem
 * ~440 kcal vybrala snapshot #308 "Vejce s pečivem a zeleninou" — přesně to
 * nahrazované jídlo, protože to je zároveň nejbližší kalorický snapshot.
 * Reprodukováno lokálně na commitu před opravou (`git stash`): deterministicky,
 * ne nahodile — každý pokus vrátil totéž.
 *
 * Oprava má tři vrstvy, testované samostatně níž:
 *  1. `replaceMealInStructuredPlan()` ověřuje `nextMeal` (co se DOOPRAVDY
 *     vrátí), ne jen `replacement` (co picker DOPORUČIL) — PŘED zápisem do
 *     `day.meals[mealIndex]`.
 *  2. `buildStartSafeFallbackMeal()`/`resolveSimpleStartLocalSlot()` dostávají
 *     `excluded` (nahrazované jídlo + ostatní jídla dne) a filtrují podle něj
 *     na každém místě, kde kandidáta staví; při vyčerpání vrací `null`, ne
 *     nefiltrovaný `[0]`.
 *  3. `pickSimpleStartMealAlternative()` s `requireLibraryRecipe: true`
 *     (jen pro záměnu, ne pro `enforceDietaryPublishGate`) rovnou přeskočí
 *     šablony bez knihovního receptu — ať se do vrstvy 2 vůbec nemusí chodit.
 *
 * Testuje se přes `replaceMealInStructuredPlan()` a moduly pod ním, ne přes
 * HTTP — zapojení endpointu (že se tyhle funkce vůbec volají) hlídá
 * `scripts/verify-meal-replacement-actions.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { replaceMealInStructuredPlan } from '../planMealReplace.js';
import { buildStartSafeFallbackMeal } from '../startSimpleMealFilter.js';
import { isSameSimpleStartMeal } from '../simpleStartRecipeLibrary.js';
import { pickSimpleStartMealAlternative } from '../simpleStartMealReplacement.js';
import { SIMPLE_START_CATALOG_SNAPSHOT } from '../generated/simpleStartCatalogSnapshot.js';
import { START_MEAL_TEMPLATES } from '../services/simpleMealPlannerAgent.js';

function planSJidlem(jidla) {
  return {
    targets: { calories_per_day: 2200, protein_g: 140, carbs_g: 220, fat_g: 70 },
    days: [{
      date: '2026-09-15',
      day_index: 0,
      day_name: 'Pondělí',
      daily_target_kcal: 2200,
      meals: jidla,
    }],
  };
}

const VEJCE_308 = {
  type: 'breakfast',
  name_cs: 'Vejce s pečivem a zeleninou',
  display_name_cs: 'Vejce s pečivem a zeleninou',
  kcal: 400, protein_g: 24, carbs_g: 38, fat_g: 22,
  catalog_id: 308,
};
const KURE = { type: 'lunch', name_cs: 'Kuře s rýží a zeleninou', display_name_cs: 'Kuře s rýží a zeleninou', kcal: 700, catalog_id: 401 };
const JOGURT = { type: 'snack', name_cs: 'Jogurt s ovocem', display_name_cs: 'Jogurt s ovocem', kcal: 300, catalog_id: 402 };
const LOSOS = { type: 'dinner', name_cs: 'Losos se zeleninou', display_name_cs: 'Losos se zeleninou', kcal: 800, catalog_id: 403 };

const bodyMetrics = { diet_type: 'standard', calories_target: 2200, meals_per_day: 4 };

// ─────────────────────────────────────────────────────────────────────────
// Vrstva 1 + 3 dohromady: přesná reprodukce produkčního nálezu.
// ─────────────────────────────────────────────────────────────────────────

test('produkční nález: záměna snídaně #308 nevrátí totéž jídlo, opakovaně (5×)', async () => {
  for (let i = 0; i < 5; i++) {
    const plan = planSJidlem([VEJCE_308, KURE, JOGURT, LOSOS]);
    const result = await replaceMealInStructuredPlan(plan, 0, 0, bodyMetrics);
    assert.notEqual(result.meal.catalog_id, 308, `pokus ${i}: vrátilo se catalog_id 308`);
    assert.notEqual(
      String(result.new_title || '').toLowerCase(),
      'vejce s pečivem a zeleninou',
      `pokus ${i}: vrátil se stejný název`
    );
  }
});

test('záměna nevytvoří dvě stejná jídla v jednom dni', async () => {
  const plan = planSJidlem([VEJCE_308, KURE, JOGURT, LOSOS]);
  const result = await replaceMealInStructuredPlan(plan, 0, 0, bodyMetrics);
  const noveJidlo = result.meal;
  const zbylaJidla = result.structuredPlan.days[0].meals.slice(1);
  for (const jidlo of zbylaJidla) {
    assert.equal(
      isSameSimpleStartMeal(noveJidlo, jidlo),
      false,
      `nové jídlo "${noveJidlo.display_name_cs}" je stejné jako "${jidlo.display_name_cs || jidlo.name_cs}"`
    );
  }
});

test('když den už obsahuje všechny snídaňové alternativy, záměna vrátí NO_ALTERNATIVE, ne 200', async () => {
  // Den s tolika "snídaněmi", kolik má standard/breakfast šablon — picker
  // (excludeTitles = celý den) proto nemá co vybrat, ať zkusí cokoli.
  const vsechnyNazvy = START_MEAL_TEMPLATES.standard.breakfast.map((t) => t.name_cs);
  assert.ok(vsechnyNazvy.length >= 2, 'test předpokládá aspoň 2 šablony pro standard/breakfast');
  const jidla = vsechnyNazvy.map((nazev, i) => ({
    type: 'breakfast',
    name_cs: nazev,
    display_name_cs: nazev,
    kcal: 400 + i,
    catalog_id: 9000 + i,
  }));
  const plan = planSJidlem(jidla);
  await assert.rejects(
    () => replaceMealInStructuredPlan(plan, 0, 0, bodyMetrics),
    /NO_ALTERNATIVE/,
    'mělo vyhodit NO_ALTERNATIVE, ne vrátit 200 s nějakým jídlem'
  );
});

// ─────────────────────────────────────────────────────────────────────────
// Vrstva 2 samostatně: buildStartSafeFallbackMeal respektuje `excluded`.
// ─────────────────────────────────────────────────────────────────────────

test('buildStartSafeFallbackMeal: vyloučené jídlo se nevrátí, i když je kalorický nejbližší', () => {
  const slotMeal = {
    type: 'breakfast',
    name_cs: 'Tvaroh s vločkami a banánem', // nemá knihovní recept -> jde rovnou do fallbacku
    fallback_meal_template: { name_cs: 'Tvaroh s vločkami a banánem', kcal: 420 },
    _body_metrics: bodyMetrics,
  };
  const denJidla = [VEJCE_308, KURE];

  const bezVylouceni = buildStartSafeFallbackMeal(slotMeal, 440, 0, []);
  assert.equal(bezVylouceni.catalog_id, 308, 'bez vyloučení musí reprodukovat starý nález (#308)');

  const sVylouceni = buildStartSafeFallbackMeal(slotMeal, 440, 0, denJidla);
  assert.notEqual(sVylouceni.catalog_id, 308);
  assert.equal(isSameSimpleStartMeal(sVylouceni, VEJCE_308), false);
});

test('buildStartSafeFallbackMeal: když je vyloučeno úplně vše, vrací null — ne nefiltrovaný kandidát', () => {
  const vsechnySnapshotySnidane = SIMPLE_START_CATALOG_SNAPSHOT.filter((s) => s.meal_type === 'breakfast');
  assert.ok(vsechnySnapshotySnidane.length > 0, 'test předpokládá aspoň jeden breakfast snapshot');
  // Statické nouzové šablony z START_SAFE_FALLBACK_BY_TYPE.breakfast
  // (lib/startSimpleMealFilter.js) — modul je neexportuje samostatně, jména
  // jsou ale stabilní (viz zdroj souboru).
  const vsechnyNouzoveSablony = [
    { name_cs: 'Tvaroh s vločkami a banánem' },
    { name_cs: 'Řecký jogurt s ovocem' },
    { name_cs: 'Vejce s pečivem a zeleninou' },
    { name_cs: 'Ovesná kaše' },
  ];
  const excluded = [...vsechnySnapshotySnidane, ...vsechnyNouzoveSablony];

  const slotMeal = {
    type: 'breakfast',
    name_cs: 'Nesmyslný název bez knihovního receptu xyz123',
    fallback_meal_template: null,
    _body_metrics: bodyMetrics,
  };
  const result = buildStartSafeFallbackMeal(slotMeal, 440, 0, excluded);
  assert.equal(result, null);
});

// ─────────────────────────────────────────────────────────────────────────
// Vrstva 3 samostatně: requireLibraryRecipe.
// ─────────────────────────────────────────────────────────────────────────

test('pickSimpleStartMealAlternative: requireLibraryRecipe=true vybere jen šablonu s knihovním receptem', () => {
  const vybrano = pickSimpleStartMealAlternative({
    mealType: 'breakfast',
    currentTitle: 'Vejce s pečivem a zeleninou',
    bodyMetrics,
    targetKcal: 440,
    requireLibraryRecipe: true,
  });
  assert.ok(vybrano, 'mělo se něco vybrat — standard/breakfast má 5 šablon s receptem');
  assert.ok(vybrano.lib, 'vybraný kandidát musí mít knihovní recept');
  assert.notEqual(vybrano.title.toLowerCase(), 'tvaroh s vločkami a banánem');
});

test('pickSimpleStartMealAlternative: bez requireLibraryRecipe (výchozí) se chová jako dřív', () => {
  // enforceDietaryPublishGate (lib/dietaryPublishGate.js) volá bez tohohle
  // parametru a spoléhá, že i šablona bez receptu je platný kandidát.
  const vybrano = pickSimpleStartMealAlternative({
    mealType: 'breakfast',
    currentTitle: 'Vejce s pečivem a zeleninou',
    bodyMetrics,
    targetKcal: 420,
  });
  assert.ok(vybrano, 'mělo se něco vybrat');
});

// ─────────────────────────────────────────────────────────────────────────
// isSameSimpleStartMeal — čistá logika porovnání identity.
// ─────────────────────────────────────────────────────────────────────────

test('isSameSimpleStartMeal: shoda podle catalog_id, i když se název liší', () => {
  assert.equal(
    isSameSimpleStartMeal({ catalog_id: 308, name_cs: 'A' }, { catalog_id: 308, name_cs: 'B' }),
    true
  );
});

test('isSameSimpleStartMeal: různá id = různé jídlo, i kdyby se název náhodou shodl', () => {
  assert.equal(
    isSameSimpleStartMeal({ catalog_id: 1, name_cs: 'Stejný název' }, { catalog_id: 2, name_cs: 'Stejný název' }),
    false
  );
});

test('isSameSimpleStartMeal: bez id (knihovní/fallback jídlo) padne na normalizovaný název', () => {
  assert.equal(
    isSameSimpleStartMeal(
      { name_cs: 'Vejce s pečivem a zeleninou' },
      { display_name_cs: 'VEJCE S PEČIVEM A ZELENINOU' }
    ),
    true
  );
});

test('isSameSimpleStartMeal: alias se počítá jako stejný název', () => {
  assert.equal(
    isSameSimpleStartMeal({ name_cs: 'Krůtí maso s bramborem' }, { name_cs: 'Kuře s rýží a zeleninou' }),
    true
  );
});

test('isSameSimpleStartMeal: různý název a žádné id = různé jídlo', () => {
  assert.equal(
    isSameSimpleStartMeal({ name_cs: 'Jogurt s ovocem' }, { name_cs: 'Losos se zeleninou' }),
    false
  );
});
