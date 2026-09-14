#!/usr/bin/env node
/**
 * Behavior/invariant testy kvality plánu (bez externích API).
 *   node scripts/verify-plan-quality-invariants.mjs
 */
import {
  normalizePublishableWorkoutExercisesInPlan,
  MAX_PUBLISHABLE_WORKOUT_SETS,
  catalogMealDisplayFields,
  mealDisplayMatchesCatalogName,
  assertPlanMealsMatchCatalogNames,
} from '../lib/planDataIntegrity.js';
import {
  computePlanQualityMetrics,
} from '../lib/planQualityMetrics.js';
import {
  isTrustedExerciseMediaUrl,
} from '../lib/exerciseRegistryMedia.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

function buildSamplePlan() {
  const target = 2000;
  const meal = (type, kcal, name) => ({
    type,
    kcal,
    name_cs: name,
    display_name_cs: name,
    recipe_verified: true,
    protein_g: 30,
    carbs_g: 40,
    fat_g: 15,
  });

  const days = [];
  for (let i = 0; i < 7; i++) {
    const isWorkout = i === 1 || i === 3 || i === 5;
    days.push({
      day_index: i,
      day_name: `Den ${i + 1}`,
      daily_target_kcal: target,
      meals: [
        meal('breakfast', 500, 'Snídaně'),
        meal('lunch', 700, 'Oběd'),
        meal('snack', 300, 'Svačina'),
        meal('dinner', 500, 'Večeře'),
      ],
      workout: isWorkout
        ? {
            exercises: [
              // Od 14. 9. 2026 jsou TRUSTED_EXERCISE_GIF_BY_KEY i
              // TRUSTED_EXTENDED_GIF_BY_KEY (lib/exerciseRegistryMedia.js) natrvalo
              // prázdné — gate už nikomu nic nepatchuje. tricep_extension/hip_thrust/
              // plank_side tu zůstávají bez gif_url záměrně: cvik bez animace smí
              // do plánu (docs/DALSI_KROK.md 9.12).
              { canonical_key: 'tricep_extension', name_cs: 'Tricepsový zdvih', sets: 5, reps: '10', gif_url: null },
              { canonical_key: 'hip_thrust', name_cs: 'Hip thrust', sets: 6, reps: '12', gif_url: null },
              { canonical_key: 'plank_side', name_cs: 'Boční prkno', sets: 3, duration_sec: 45, gif_url: null },
            ],
          }
        : null,
    });
  }

  return {
    days,
    targets: { calories_per_day: target, protein_g: 140, carbs_g: 200, fat_g: 70 },
    _diagnostics: { generation_source: 'catalog' },
  };
}

const bodyMetrics = {
  meals_per_day: 4,
  workouts_per_week: 3,
  calories_target: 2000,
};

const plan = buildSamplePlan();
normalizePublishableWorkoutExercisesInPlan(plan);
const metrics = computePlanQualityMetrics(plan, bodyMetrics, { generation_source: 'catalog' });

check('plán má 7 dní', plan.days.length === 7);
check('každý den má 4 jídla', plan.days.every((d) => (d.meals || []).length === 4));
check(
  'workout days v toleranci',
  metrics.workout_days_count >= 2 && metrics.workout_days_count <= 4,
  `count=${metrics.workout_days_count}`
);

let setsViolation = false;
let staleHotlinkViolation = false;
for (const day of plan.days) {
  for (const ex of day?.workout?.exercises || []) {
    const key = String(ex.canonical_key || '').toLowerCase();
    if (['warmup', 'cooldown', 'rest', 'stretch'].includes(key)) continue;
    if (Number(ex.sets) > MAX_PUBLISHABLE_WORKOUT_SETS) setsViolation = true;
    // Gate už žádný gif_url nefabrikuje (TRUSTED_*_GIF_BY_KEY jsou prázdné,
    // docs/DALSI_KROK.md 9.12) — cvik bez animace je v pořádku. Co pořád platí:
    // pokud gif_url existuje, nesmí to být zastaralý odkaz na Gym Visual/wger.
    if (ex.gif_url && !isTrustedExerciseMediaUrl(ex.gif_url)) staleHotlinkViolation = true;
  }
}
check('žádný publishable cvik nemá víc než 4 série', !setsViolation);
check('žádný cvik nemá gif_url mimo vlastní Storage (žádný Gym Visual/wger)', !staleHotlinkViolation);
check(
  'kcal dny v toleranci ±10 %',
  metrics.daily_kcal_out_of_tolerance_count === 0,
  `out=${metrics.daily_kcal_out_of_tolerance_count}`
);
check('quality metrics sets_over=0 po gate', metrics.sets_over_publishable_limit_count === 0);
check(
  'quality metrics missing_gif počítá cviky bez média, nezastaví gate (9 z fixture)',
  metrics.missing_gif_count === 9,
  `missing_gif_count=${metrics.missing_gif_count}`
);

const pipelineSrc = readFileSync(resolve(process.cwd(), 'lib/unifiedPlanPipeline.js'), 'utf8');
check('pipeline volá logPlanQualityEvent', pipelineSrc.includes('logPlanQualityEvent'));

{
  const row = { id: 99, name_cs: 'Cottage s pečivem', name_en: 'Cottage' };
  const labels = catalogMealDisplayFields(row, {
    name_cs: 'Rýže s tuňákem',
    planner_source: 'simple_meal_planner_agent',
  });
  check(
    'catalog meal display_name = catalog.name_cs (ne slot)',
    labels.display_name_cs === 'Cottage s pečivem' && labels.name_cs === 'Cottage s pečivem',
    labels.display_name_cs
  );
  check(
    'slot název jen jako planner_suggestion_cs',
    labels.planner_suggestion_cs === 'Rýže s tuňákem'
  );
  check(
    'mealDisplayMatchesCatalogName ok',
    mealDisplayMatchesCatalogName(labels, row.name_cs).ok
  );
  const planCheck = assertPlanMealsMatchCatalogNames(
    { days: [{ day_index: 0, meals: [{ ...labels, catalog_id: 99 }] }] },
    { 99: row }
  );
  check('assertPlanMealsMatchCatalogNames ok', planCheck.ok);
  const catalogSrc = readFileSync(resolve(process.cwd(), 'lib/recipesCatalog.js'), 'utf8');
  check('recipesCatalog nepoužívá agentName pro display', !/display_name_cs\s*=\s*agentName/.test(catalogSrc));
}

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
