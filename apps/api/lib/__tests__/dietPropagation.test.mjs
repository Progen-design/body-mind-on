/**
 * DIETA MUSÍ DOJÍT AŽ DO VÝBĚRU JÍDLA, NE JEN DO BRÁNY.
 *
 * PROČ TENHLE TEST EXISTUJE
 * 10. 8. 2026, req_1786345751470, 2086 řádků logu. Uživatel s
 * `diet_type: 'gluten_free'` nedostal plán. V logu:
 *   [simple-meal-planner-agent] skeleton built { diet: 'standard' }   3×
 *   všech 16 katalogových dotazů:  dietTags: []
 *
 * Kořen: `bodyMetricsToPlanInput()` zploštila diet_type na 'standard' a její
 * výstup se v runUnifiedPlanPipeline rozprostírá PŘES body_metrics
 * (`{ ...bm, ...planNorm }`). Skutečnou dietu tak znala jedině publikační
 * brána — poslední, kdo měl pravdu, a první, kdo si stěžoval.
 *
 * Změřeno na tehdejším stavu: plánovač navrhl 4 z 10 slotů s lepkem, nouzová
 * cesta pak COMPLIANTNÍ jídlo nahradila NEcompliantním („Tvaroh s ovocem“ →
 * snapshot „Cottage s pečivem“), a vlastní opravná větev brány to celé
 * zopakovala, protože stavěla na tomtéž zploštěném skeletonu.
 *
 * Testuje se proto propagace, ne chování jedné funkce.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bodyMetricsToPlanInput } from '../bodyMetricsToPlanInput.js';

import {
  buildDietaryPublishRules,
  mealDietaryViolation,
  checkCandidateAgainstDiet,
  dietTagsFromProfile,
  findDietaryViolations,
  candidateMatchesMacroPreference,
  preferByMacros,
} from '../dietaryRules.js';
import { buildSimpleStartMealSkeleton, START_MEAL_TEMPLATES } from '../services/simpleMealPlannerAgent.js';
import { resolveSimpleStartLocalSlot } from '../startSimpleMealFilter.js';
import { enforceDietaryPublishGate } from '../dietaryPublishGate.js';
import { planMealTypeToWeightKey, slotTargetKcal } from '../nutrition/portionScaling.js';
import { buildCalorieTargetBodyMetricsPatch } from '../calorieTargetIntegrity.js';

/** Diety, které registrace nabízí (lib/dietOptions.js) + „žádná“. */
const DIETY = ['standard', 'vegetarian', 'gluten_free', 'lactose_free', 'low_carb'];

function bmPro(diet) {
  return { id: 1, user_id: 'u1', diet_type: diet, calories_target: 2400, weight_kg: 80, goal: 'udrzovani' };
}

/** Ticho — plánovač i nouzové cesty logují a v testu to jen zaplevelí výstup. */
function bezLogu(fn) {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, orig);
  }
}

/** Postaví plán stejnou cestou jako START: skeleton → sloty. */
function postavPlan(bm, days = 7) {
  return bezLogu(() => {
    const sk = buildSimpleStartMealSkeleton({ bodyMetrics: bm, days });
    const daily = Number(sk.targets.calories_per_day) || 2200;
    const mpd = sk.meal_plan.meals_per_day;
    const planDays = [];
    for (const day of sk.meal_plan.days) {
      const meals = [];
      for (let mi = 0; mi < day.meals.length; mi++) {
        const slot = day.meals[mi];
        const target = slotTargetKcal(daily, mpd, planMealTypeToWeightKey(slot.type));
        const { meal } = resolveSimpleStartLocalSlot(slot, target, mi, bm);
        if (meal) meals.push(meal);
      }
      planDays.push({ meals });
    }
    return { skeleton: sk, planJson: { days: planDays, targets: sk.targets } };
  });
}

test('bodyMetricsToPlanInput dietu nezplošťuje', () => {
  // Tenhle jediný řádek stál tři kola hledání.
  for (const diet of DIETY) {
    assert.equal(
      bodyMetricsToPlanInput(bmPro(diet)).diet_type,
      diet,
      `planInput.diet_type přepsal ${diet} — a jeho výstup se rozprostírá přes body_metrics`
    );
  }

  // Úzký trojstav pro GPT existuje dál, ale jako VLASTNÍ pole.
  assert.equal(bodyMetricsToPlanInput(bmPro('gluten_free')).diet_type_ai, 'standard');
  assert.equal(bodyMetricsToPlanInput(bmPro('vegan')).diet_type_ai, 'vegan');
});

test('sloučení bm + planInput nesmí dietu ztratit', () => {
  // Přesně to, co dělá runUnifiedPlanPipeline.
  const bm = bmPro('gluten_free');
  const merged = { ...bm, ...bodyMetricsToPlanInput(bm) };
  assert.equal(merged.diet_type, 'gluten_free', 'planNorm přebil bm.diet_type');
  assert.equal(buildDietaryPublishRules(merged).glutenFree, true);
});

test("dietTagsFromProfile: 'standard' není odpověď, ale „nikdo nic neřekl“", () => {
  const bm = bmPro('gluten_free');

  // Přímé volání funguje i před opravou.
  assert.deepEqual(dietTagsFromProfile(bm, 'gluten_free'), ['gluten_free']);

  // Tohle je ta chyba: volající dietu zploštil, `'standard'` je truthy, takže
  // fallback na profil se nikdy nespustil a vzniklo `dietTags: []`.
  assert.deepEqual(
    dietTagsFromProfile(bm, 'standard'),
    ['gluten_free'],
    "'standard' od volajícího nesmí přebít diet_type z profilu"
  );
  assert.deepEqual(dietTagsFromProfile(bm, undefined), ['gluten_free']);
  assert.deepEqual(dietTagsFromProfile(bm, ''), ['gluten_free']);

  // Uživatel bez omezení pořád nemá žádné tagy.
  assert.deepEqual(dietTagsFromProfile(bmPro('standard'), 'standard'), []);
});

test('plánovač nenavrhne slot, který dietu poruší', () => {
  // Změřeno před opravou: 4 z 10 slotů (Kuřecí tortilla, Cottage s pečivem,
  // Cottage s ořechy a pečivem) — a to ještě než se cokoli vybíralo z katalogu.
  for (const diet of DIETY) {
    const bm = bmPro(diet);
    const rules = buildDietaryPublishRules(bm);
    const { skeleton } = postavPlan(bm, 7);

    const spatne = [];
    for (const day of skeleton.meal_plan.days) {
      for (const slot of day.meals) {
        const v = checkCandidateAgainstDiet(slot, rules);
        if (!v.ok) spatne.push(`${slot.name_cs} (${v.code}: ${v.matched_term})`);
      }
    }
    assert.deepEqual(spatne, [], `${diet}: plánovač navrhl porušující sloty:\n  ${spatne.join('\n  ')}`);
  }
});

test('nouzová cesta nesmí compliantní jídlo nahradit porušujícím', () => {
  // Konkrétní změřený případ: „Tvaroh s ovocem“ je bezlepkový, snapshot
  // fallback z něj udělal „Cottage s pečivem“. Nouzová cesta plán ZHORŠILA.
  const bm = bmPro('gluten_free');
  const rules = buildDietaryPublishRules(bm);

  const slot = {
    type: 'snack',
    name_cs: 'Tvaroh s ovocem',
    fallback_meal_template: {
      name_cs: 'Tvaroh s ovocem',
      kcal: 240,
      protein_g: 20,
      carbs_g: 22,
      fat_g: 8,
      shopping_ingredient_lines: ['tvaroh 180 g', 'banán 1 ks'],
    },
    simple_start_mode: true,
    planner_source: 'simple_meal_planner_agent',
  };

  const { meal } = bezLogu(() => resolveSimpleStartLocalSlot(slot, 240, 0, bm));
  assert.ok(meal, 'pro bezlepkovou svačinu musí něco zbýt');
  assert.equal(
    mealDietaryViolation(meal, rules),
    null,
    `nouzová cesta vrátila „${meal.display_name_cs || meal.name_cs}“, což dietu porušuje`
  );
});

test('celý START plán projde bránou pro každou nabízenou dietu', () => {
  for (const diet of DIETY) {
    const bm = bmPro(diet);
    const rules = buildDietaryPublishRules(bm);
    const { planJson } = postavPlan(bm, 7);

    const porusujici = [];
    for (const day of planJson.days) {
      for (const meal of day.meals) {
        const code = mealDietaryViolation(meal, rules);
        if (code) porusujici.push(`${meal.display_name_cs || meal.name_cs} (${code})`);
      }
    }
    assert.deepEqual(porusujici, [], `${diet}: v plánu zůstala porušující jídla:\n  ${porusujici.join('\n  ')}`);

    // Žádný slot se nesmí cestou vytratit — plán o 35 slotech musí mít 35 jídel.
    const pocet = planJson.days.reduce((n, d) => n + d.meals.length, 0);
    assert.equal(pocet, 35, `${diet}: plán má ${pocet} jídel místo 35`);

    const verdikt = bezLogu(() => enforceDietaryPublishGate(planJson, bm));
    assert.equal(verdikt.ok, true, `${diet}: brána plán odmítla (${verdikt.violations})`);
  }
});

test('porušení nese den, jídlo a KONKRÉTNÍ výraz', () => {
  // V celém requestu o 2086 řádcích nebylo slovo „gluten“ ani jednou, protože
  // se hlásil jen počet porušení.
  const bm = bmPro('gluten_free');
  const planJson = {
    targets: { calories_per_day: 2000 },
    days: [{
      day_name: 'Pondělí',
      meals: [{
        type: 'breakfast',
        name_cs: 'Vejce s pečivem a zeleninou',
        display_name_cs: 'Vejce s pečivem a zeleninou',
        kcal: 450,
        shopping_ingredient_lines: ['vejce 3 ks', 'celozrné pečivo 2 plátky'],
      }],
    }],
  };

  const hits = findDietaryViolations(planJson, buildDietaryPublishRules(bm));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'gluten_free');
  assert.equal(hits[0].matched_term, 'pecivo', 'musí být vidět KTERÝ výraz');
  assert.equal(hits[0].day, 'Pondělí');
  assert.equal(hits[0].meal_type, 'breakfast');
  assert.equal(hits[0].meal_name, 'Vejce s pečivem a zeleninou');

  // A tenhle konkrétní plán brána UMÍ opravit — proto se netestuje na selhání.
  // Před opravou propagace ho opravit neumělo, protože náhradní skeleton
  // stavěla na téže zploštěné dietě.
  assert.equal(bezLogu(() => enforceDietaryPublishGate(planJson, bm)).ok, true);
});

test('když brána selže, řekne v návratové hodnotě proč', () => {
  // Nesplnitelné omezení z volného textu — náhrada nemá z čeho brát, takže
  // se projde celá kaskáda a brána skončí neúspěchem. Právě tady musí být
  // detail, jinak je další pád stejně slepý jako ten 10. 8. 2026.
  const bm = {
    ...bmPro('standard'),
    foods_to_avoid: 'vejce, tvaroh, jogurt, cottage, rýže, brambory, kuře, banán, '
      + 'mléko, protein, zelenina, fazole, čočka, tuňák, mandle, ovoce, med, olej, pečivo, vločky',
  };

  const planJson = {
    targets: { calories_per_day: 2000 },
    days: [{
      day_name: 'Pondělí',
      meals: [{
        type: 'lunch',
        name_cs: 'Kuře s rýží a zeleninou',
        display_name_cs: 'Kuře s rýží a zeleninou',
        kcal: 600,
        shopping_ingredient_lines: ['kuřecí prsa 150 g', 'rýže 80 g'],
      }],
    }],
  };

  const verdikt = bezLogu(() => enforceDietaryPublishGate(planJson, bm));
  assert.equal(verdikt.ok, false, 'nesplnitelné omezení musí skončit neúspěchem');
  assert.ok(Array.isArray(verdikt.violationDetails), 'detail musí být v návratové hodnotě');
  assert.ok(verdikt.violationDetails.length > 0, 'detail nesmí být prázdný');
  const d = verdikt.violationDetails[0];
  assert.ok(d.code, 'kód porušení');
  assert.ok(d.meal_name, 'které jídlo');
  assert.ok(d.matched_term, 'který výraz');
});

test('low_carb je PREFERENCE, ne tvrdé veto', () => {
  // Lepek a laktóza jsou omezení — kvůli nim se plán radši nevydá. `low_carb`
  // je makrový cíl a publikační brána ho nikdy neblokovala. Změřeno 10. 8. 2026:
  // jako tvrdé veto nechá nula večeří v katalogu (15 s tagem → 0 po START
  // filtru) i nula v knihovně, takže uživatel skončí bez plánu.
  const rules = buildDietaryPublishRules(bmPro('low_carb'));

  // Rýže: 540 kcal / 72 g carbs = 53 % energie — makrům nevyhovuje…
  const ryze = { name_cs: 'Rýže s vejcem', kcal: 540, carbs_g: 72 };
  assert.equal(candidateMatchesMacroPreference(ryze, rules), false);
  // …ale tvrdé omezení to není, takže sama o sobě neblokuje.
  assert.equal(checkCandidateAgainstDiet(ryze, rules).ok, true);

  // Omeleta: 480 kcal / 18 g carbs = 15 % → makrům vyhovuje.
  const omeleta = { name_cs: 'Omeleta se zeleninou', kcal: 480, carbs_g: 18 };
  assert.equal(candidateMatchesMacroPreference(omeleta, rules), true);

  // Preference zúží nabídku, když má z čeho.
  assert.deepEqual(preferByMacros([ryze, omeleta], rules), [omeleta]);

  // A NIKDY ji nevyprázdní — jinak by low_carb uživatel skončil bez plánu.
  assert.deepEqual(preferByMacros([ryze], rules), [ryze]);

  // Pro uživatele bez low_carb se nezužuje vůbec.
  const bezDiety = buildDietaryPublishRules(bmPro('standard'));
  assert.deepEqual(preferByMacros([ryze, omeleta], bezDiety), [ryze, omeleta]);
});

test('tvrdá omezení naopak nabídku vyprázdnit SMÍ', () => {
  // Rozdíl proti low_carb: u lepku je prázdný pool správná odpověď.
  const rules = buildDietaryPublishRules(bmPro('gluten_free'));
  const chleb = { name_cs: 'Chleba s arašídovým máslem', kcal: 470, carbs_g: 48 };
  assert.equal(checkCandidateAgainstDiet(chleb, rules).ok, false);
  assert.equal(checkCandidateAgainstDiet(chleb, rules).code, 'gluten_free');
  assert.equal(preferByMacros([], rules).length, 0);
});

test('žádná dieta nezůstane bez šablon pro některý slot', () => {
  // Filtr balíku `standard` musí pro každou dietu nechat dost šablon. Kdyby
  // ne, plánovač padá — což je líp než porušit dietu, ale uživatel je bez plánu.
  for (const diet of DIETY) {
    const rules = buildDietaryPublishRules(bmPro(diet));
    const pack = START_MEAL_TEMPLATES[diet === 'vegetarian' ? 'vegetarian' : 'standard'];
    for (const type of ['breakfast', 'lunch', 'dinner', 'snack']) {
      const kept = (pack[type] || []).filter((t) => checkCandidateAgainstDiet(t, rules).ok);
      assert.ok(
        kept.length > 0,
        `${diet}/${type}: po dietním filtru nezbyla ani jedna šablona`
      );
    }
  }
});

test('calories_target patch píše jen sloupce, které v body_metrics jsou', () => {
  // `protein_g`/`carbs_g`/`fat_g` v tabulce nejsou, takže je Postgres odmítl
  // celý UPDATE — a neuložilo se ani `calories_target`. Chyba se spolkla
  // do console.warn a v logu ležela potřetí.
  const patch = buildCalorieTargetBodyMetricsPatch(
    { weight_kg: 80, goal: 'redukce', activity: 'stredni' },
    { forceRecalculate: true }
  );
  assert.deepEqual(
    Object.keys(patch).sort(),
    ['calories_target'],
    'patch obsahuje sloupec, který v body_metrics neexistuje'
  );
  assert.ok(Number.isFinite(patch.calories_target) && patch.calories_target > 0);
});
