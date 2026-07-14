#!/usr/bin/env node
/**
 * Ověří náhradu cviku v profilu (stejný pattern jako jídla).
 *   node scripts/verify-workout-replacement-actions.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pickWorkoutExerciseAlternative } from '../lib/planWorkoutExercisePick.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let failed = 0;
function fail(msg) { console.log(`FAIL ${msg}`); failed += 1; }
function ok(msg) { console.log(`OK ${msg}`); }

console.log('--- workout replacement wiring ---');
const planViewer = fs.readFileSync(path.join(root, 'components/PlanViewer.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'pages/api/plan-replace-workout-exercise.js'), 'utf8');
if (!planViewer.includes("'/api/plan-replace-workout-exercise'")) fail('PlanViewer missing plan-replace-workout-exercise API call');
if (!planViewer.includes('performExerciseSwap')) fail('PlanViewer missing performExerciseSwap');
if (!planViewer.includes('Nahradit jiným')) fail('PlanViewer missing Nahradit jiným for exercises');
if (!api.includes('replaceWorkoutExerciseInStructuredPlan')) fail('API missing replaceWorkoutExerciseInStructuredPlan');
if (!api.includes('structured_plan_json')) fail('API missing DB persistence');
else ok('replace button + API + DB persistence wired');

console.log('\n--- replacement logic ---');
const bodyMetrics = { training_environment: 'gym', workouts_per_week: 3, goal: 'udrzovani' };
const structured = {
  days: [
    {
      day_index: 0,
      workout: {
        exercises: [
          { canonical_key: 'squat', name_cs: 'Dřepy', sets: 3, reps: '10' },
          { canonical_key: 'bench_press', name_cs: 'Bench press', sets: 3, reps: '8' },
          { canonical_key: 'row', name_cs: 'Přítah', sets: 3, reps: '10' },
        ],
      },
    },
    {
      day_index: 2,
      workout: {
        exercises: [
          { canonical_key: 'deadlift', name_cs: 'Mrtvý tah', sets: 3, reps: '6' },
          { canonical_key: 'ohp', name_cs: 'Tlak nad hlavu', sets: 3, reps: '8' },
        ],
      },
    },
  ],
};

const alt = pickWorkoutExerciseAlternative(structured, 0, 0, bodyMetrics);
if (!alt || alt.canonical_key === 'squat') fail('no alternative exercise for squat');
else ok(`alternative exercise: ${alt.name_cs || alt.canonical_key}`);

const usedKeys = new Set();
for (const day of structured.days) {
  for (const ex of day.workout?.exercises || []) {
    usedKeys.add(String(ex.canonical_key || '').toLowerCase());
  }
}
if (alt && usedKeys.has(String(alt.canonical_key || '').toLowerCase())) {
  fail('alternative duplicates existing week exercise');
} else {
  ok('alternative avoids exercises already in week');
}

const planReplace = fs.readFileSync(path.join(root, 'lib/planWorkoutReplace.js'), 'utf8');
const planPick = fs.readFileSync(path.join(root, 'lib/planWorkoutExercisePick.js'), 'utf8');
if (!planReplace.includes('MAX_PUBLISHABLE_WORKOUT_SETS')) fail('planWorkoutReplace missing sets cap');
if (!planReplace.includes('mergeWithTrustedRegistryMedia')) fail('planWorkoutReplace missing trusted media');
if (!planPick.includes('pickWorkoutExerciseAlternative')) fail('planWorkoutExercisePick missing picker');
else ok('planWorkoutReplace applies media gate + sets cap');

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
