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
  isTrustedExercisedbGifUrl,
  resolveTrustedGifForCanonicalKey,
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
              { canonical_key: 'squat', name_cs: 'Dřepy', sets: 5, reps: '10', gif_url: null },
              { canonical_key: 'hip_thrust', name_cs: 'Hip thrust', sets: 6, reps: '12', gif_url: null },
              { canonical_key: 'plank', name_cs: 'Prkno', sets: 3, duration_sec: 45, gif_url: null },
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
let gifViolation = false;
for (const day of plan.days) {
  for (const ex of day?.workout?.exercises || []) {
    const key = String(ex.canonical_key || '').toLowerCase();
    if (['warmup', 'cooldown', 'rest', 'stretch'].includes(key)) continue;
    if (Number(ex.sets) > MAX_PUBLISHABLE_WORKOUT_SETS) setsViolation = true;
    const registryGif = resolveTrustedGifForCanonicalKey(key);
    if (registryGif && !isTrustedExercisedbGifUrl(ex.gif_url)) gifViolation = true;
  }
}
check('žádný publishable cvik nemá víc než 4 série', !setsViolation);
check('canonical cviky mají trusted GIF po gate', !gifViolation);
check(
  'kcal dny v toleranci ±5 %',
  metrics.daily_kcal_out_of_tolerance_count === 0,
  `out=${metrics.daily_kcal_out_of_tolerance_count}`
);
check('quality metrics sets_over=0 po gate', metrics.sets_over_publishable_limit_count === 0);
check('quality metrics missing_gif=0 po gate', metrics.missing_gif_count === 0);

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
