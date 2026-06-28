#!/usr/bin/env node
import { resolveToCanonicalKey, CANONICAL_EXERCISES } from '../lib/exerciseCanonicalMap.js';
import { getExerciseInstructionGuide, hasExerciseInstructionGuide } from '../lib/exerciseInstructions.js';
import { filterWorkoutPlanForTrainingEnvironment } from '../lib/trainingEnvironment.js';

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

console.log('\n--- canonical registry completeness ---');
for (const key of required) {
  if (!CANONICAL_EXERCISES[key]) fail(`missing CANONICAL_EXERCISES.${key}`);
}
if (!failed) ok('canonical exercise registry covers core set');

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
