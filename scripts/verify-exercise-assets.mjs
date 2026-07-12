#!/usr/bin/env node
import { resolveToCanonicalKey, CANONICAL_EXERCISES } from '../lib/exerciseCanonicalMap.js';
import { getExerciseInstructionGuide, hasExerciseInstructionGuide } from '../lib/exerciseInstructions.js';
import { filterWorkoutPlanForTrainingEnvironment } from '../lib/trainingEnvironment.js';
import { computeMacroRatio } from '../lib/macroRatioDisplay.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let failed = 0;
function fail(msg) {
  console.log(`FAIL ${msg}`);
  failed += 1;
}
function ok(msg) {
  console.log(`OK ${msg}`);
}

console.log('--- squat vs lunge mapping ---');
const squatKey = resolveToCanonicalKey('Dřepy');
const lungeKey = resolveToCanonicalKey('Výpady');
if (squatKey !== 'squat') fail(`Dřepy -> ${squatKey}, expected squat`);
else ok('Dřepy maps to squat');
if (lungeKey !== 'lunges') fail(`Výpady -> ${lungeKey}, expected lunges`);
else ok('Výpady maps to lunges');
if (squatKey === lungeKey) fail('squat and lunges must not share canonical key');

const hipKey = resolveToCanonicalKey('Hip thrust');
if (hipKey !== 'hip_thrust') fail(`Hip thrust -> ${hipKey}, expected hip_thrust`);
else ok('Hip thrust maps to hip_thrust');
const gluteKey = resolveToCanonicalKey('Glute bridge');
if (gluteKey !== 'glute_bridge') fail(`Glute bridge -> ${gluteKey}, expected glute_bridge`);
else ok('Glute bridge maps to glute_bridge');

console.log('\n--- exercise instructions ---');
const required = ['squat', 'lunges', 'pushup', 'plank', 'superman', 'bent_over_row', 'romanian_deadlift'];
for (const key of required) {
  if (!hasExerciseInstructionGuide(key)) fail(`missing instruction guide for ${key}`);
}
if (!failed) ok('core exercise guides present');
const supermanGuide = getExerciseInstructionGuide('superman');
if (!supermanGuide?.how?.includes('břicho')) fail('Superman guide missing body position');
else ok('Superman has text guide');

console.log('\n--- home bodyweight workout adaptation ---');
const plan = {
  days: [{
    day_index: 1,
    exercises: [
      { canonical_key: 'bench_press', search_term: 'bench press', name_cs: 'Tlak na lavici', sets: 3, reps: '10' },
      { canonical_key: 'squat', search_term: 'squat', name_cs: 'Dřepy', sets: 3, reps: '10' },
    ],
  }],
};
filterWorkoutPlanForTrainingEnvironment(plan, {
  training_environment: 'home_bodyweight',
  notes: 'Kde cvičí: Doma bez vybavení',
});
const keys = plan.days[0].exercises.map((e) => e.canonical_key);
if (keys.includes('bench_press')) fail('bench_press should be replaced at home');
if (!keys.includes('pushup')) fail('bench_press should become pushup at home');
if (!keys.includes('squat')) fail('squat should remain at home');
ok('home bodyweight replaces gym-only exercises');

console.log('\n--- gym strictness (no bodyweight fillers) ---');
const gymForbidden = ['squat', 'lunges', 'glute_bridge', 'mountain_climber', 'plank_side', 'russian_twist', 'pushup'];
const gymPreferred = ['leg_press', 'goblet_squat', 'chest_press', 'lat_puldown', 'hip_thrust', 'hamstring_curl'];
const gymPlan = {
  days: [{
    day_index: 1,
    exercises: gymForbidden.map((key) => ({ canonical_key: key, search_term: key, name_cs: key, sets: 3, reps: '10' })),
  }],
};
filterWorkoutPlanForTrainingEnvironment(gymPlan, { training_environment: 'gym', notes: 'Kde cvičí: Posilovna' });
const gymKeys = gymPlan.days[0].exercises.map((e) => e.canonical_key);
for (const forbidden of gymForbidden) {
  if (gymKeys.includes(forbidden)) fail(`gym plan still contains forbidden ${forbidden}`);
}
if (!gymKeys.some((k) => gymPreferred.includes(k) || ['bench_press', 'bent_over_row', 'romanian_deadlift'].includes(k))) {
  fail('gym plan should contain gym equipment exercises after adaptation');
}
ok('gym environment replaces bodyweight exercises');

const gymForbiddenPattern = /canonical_key:\s*'(squat|lunges|glute_bridge|mountain_climber|plank_side|russian_twist|pushup)'/;
const templatesSrc = fs.readFileSync(path.join(root, 'lib/workoutTemplates.js'), 'utf8');
const scalerSrc = fs.readFileSync(path.join(root, 'lib/workoutPlanScaler.js'), 'utf8');
const fallbackSrc = fs.readFileSync(path.join(root, 'lib/services/deterministicFallback.js'), 'utf8');
const replaceWorkoutSrc = fs.readFileSync(path.join(root, 'pages/api/onboarding/replace-workout.js'), 'utf8');

if (!templatesSrc.includes('export const GYM_TEMPLATES')) fail('workoutTemplates missing GYM_TEMPLATES');
if (!templatesSrc.includes('export const HOME_BODYWEIGHT_TEMPLATES')) fail('workoutTemplates missing HOME_BODYWEIGHT_TEMPLATES');
if (!templatesSrc.includes('export function workoutBlocksForBodyMetrics')) fail('workoutTemplates missing workoutBlocksForBodyMetrics');
if (!templatesSrc.includes('export function sessionTemplatesForBodyMetrics')) fail('workoutTemplates missing sessionTemplatesForBodyMetrics');
if (!templatesSrc.includes('HOME_EQUIPMENT_DUMBBELL_BENCH_TEMPLATES')) fail('workoutTemplates missing HOME_EQUIPMENT_DUMBBELL_BENCH_TEMPLATES');
const sessionFnBlock = templatesSrc.split('function homeTemplatesForBodyMetrics')[1]?.split('export function rotatedTemplatesForBodyMetrics')[0] || '';
if (!sessionFnBlock.includes('HOME_EQUIPMENT_DUMBBELL_BENCH_TEMPLATES')) {
  fail('sessionTemplatesForBodyMetrics must use HOME_EQUIPMENT_DUMBBELL_BENCH_TEMPLATES for home_equipment');
}
if (scalerSrc.includes('const GYM_SESSION_TEMPLATES')) fail('workoutPlanScaler must not define local GYM_SESSION_TEMPLATES');
if (fallbackSrc.includes('const GYM_WORKOUT_BLOCKS')) fail('deterministicFallback must not define local GYM_WORKOUT_BLOCKS');
if (!scalerSrc.includes("from './workoutTemplates.js'")) fail('workoutPlanScaler must import workoutTemplates');
if (!fallbackSrc.includes("from '../workoutTemplates.js'")) fail('deterministicFallback must import workoutTemplates');
if (!replaceWorkoutSrc.includes("from '../../../lib/workoutTemplates.js'")) fail('replace-workout must import workoutTemplates');
ok('workout templates single source of truth wired');

const gymBlock = templatesSrc.split('export const GYM_TEMPLATES = Object.freeze([')[1]?.split(']);')[0] || '';
if (!gymBlock) fail('GYM_TEMPLATES missing in workoutTemplates');
if (gymForbiddenPattern.test(gymBlock)) fail('GYM_TEMPLATES contains forbidden bodyweight exercise');
if (!/canonical_key:\s*'leg_press'/.test(gymBlock)) fail('GYM_TEMPLATES should include leg_press');
ok('gym session templates in workoutTemplates are gym-only');

const gymFallbackBlock = templatesSrc.split('export const GYM_FALLBACK_BLOCKS = Object.freeze([')[1]?.split(']);')[0] || '';
if (!gymFallbackBlock) fail('GYM_FALLBACK_BLOCKS missing in workoutTemplates');
if (gymForbiddenPattern.test(gymFallbackBlock)) fail('GYM_FALLBACK_BLOCKS contains forbidden bodyweight exercise');
ok('gym deterministic fallback blocks are gym-only');

const orchestratorSrc = fs.readFileSync(path.join(root, 'lib/services/planOrchestrator.js'), 'utf8');
const scaleIdx = orchestratorSrc.indexOf('scaleAndDiversifyWorkoutPlan');
const filterIdx = orchestratorSrc.indexOf('filterWorkoutPlanForTrainingEnvironment', scaleIdx);
if (scaleIdx < 0 || filterIdx < 0 || filterIdx < scaleIdx) {
  fail('planOrchestrator must filter training environment after scaleAndDiversifyWorkoutPlan');
} else {
  ok('planOrchestrator applies gym filter after workout scaler');
}

const newFormatSrc = fs.readFileSync(path.join(root, 'lib/services/planOrchestrator_newFormat.js'), 'utf8');
if (!newFormatSrc.includes('filterWorkoutPlanForTrainingEnvironment')) {
  fail('planOrchestrator_newFormat must filter training environment');
} else ok('planOrchestrator_newFormat applies gym/home filter');

const scalerFull = fs.readFileSync(path.join(root, 'lib/workoutPlanScaler.js'), 'utf8');
if (!scalerFull.includes('deduplicateExercisesAcrossWeek')) {
  fail('workoutPlanScaler should deduplicate exercises across week');
} else ok('workoutPlanScaler deduplicates exercises across sessions');

console.log('\n--- macro ratio chart math ---');
const ratio = computeMacroRatio({ protein_g: 42, carbs_g: 112, fat_g: 35, calories: 945 });
if (!ratio) fail('macro ratio should compute');
if (ratio.proteinPct + ratio.carbsPct + ratio.fatPct !== 100) fail('macro percents must sum to 100');
if (Math.abs(ratio.computedKcal - 931) > 2) fail(`expected ~931 kcal from macros, got ${ratio.computedKcal}`);
ok('macro ratio percentages sum to 100 and match 4/4/9 formula');

console.log('\n--- canonical registry completeness ---');
for (const key of required) {
  if (!CANONICAL_EXERCISES[key]) fail(`missing CANONICAL_EXERCISES.${key}`);
}
if (!failed) ok('canonical exercise registry covers core set');

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
