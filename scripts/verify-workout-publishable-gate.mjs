#!/usr/bin/env node
/**
 * Ověření publishable workout gate (max 4 série, trusted GIF, názvy).
 *   node scripts/verify-workout-publishable-gate.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  normalizePublishableWorkoutExercisesInPlan,
  MAX_PUBLISHABLE_WORKOUT_SETS,
} from '../lib/planDataIntegrity.js';
import { isTrustedExercisedbGifUrl } from '../lib/exerciseRegistryMedia.js';

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

const samplePlan = {
  days: [
    {
      day_index: 1,
      workout: {
        exercises: [
          {
            canonical_key: 'hip_thrust',
            name_cs: 'Hip thrust',
            sets: 5,
            reps: '12',
            gif_url: null,
            source: 'wger',
          },
          {
            canonical_key: 'chest_press',
            display_name_cs: 'Chest press',
            sets: 6,
            reps: '10',
            gif_url: null,
          },
          {
            canonical_key: 'plank',
            sets: 3,
            duration_sec: 45,
            gif_url: null,
          },
        ],
      },
    },
  ],
};

const stats = normalizePublishableWorkoutExercisesInPlan(samplePlan);
const exs = samplePlan.days[0].workout.exercises;

check('gate caps hip_thrust sets to max', exs[0].sets === MAX_PUBLISHABLE_WORKOUT_SETS);
check('gate caps chest_press sets to max', exs[1].sets === MAX_PUBLISHABLE_WORKOUT_SETS);
check('gate keeps plank sets', exs[2].sets === 3);
check('gate patches hip_thrust trusted GIF', isTrustedExercisedbGifUrl(exs[0].gif_url));
check('gate patches chest_press trusted GIF', isTrustedExercisedbGifUrl(exs[1].gif_url));
check('gate patches plank trusted GIF', isTrustedExercisedbGifUrl(exs[2].gif_url));
check('gate reports sets_capped', stats.sets_capped >= 2, `sets_capped=${stats.sets_capped}`);
check('gate reports media_patched', stats.media_patched >= 2, `media_patched=${stats.media_patched}`);

const pipelineSrc = readFileSync(resolve(process.cwd(), 'lib/unifiedPlanPipeline.js'), 'utf8');
check(
  'unifiedPlanPipeline calls normalizePublishableWorkoutExercisesInPlan',
  pipelineSrc.includes('normalizePublishableWorkoutExercisesInPlan(p)')
);
check(
  'planOrchestratorResolve applies mergeWithTrustedRegistryMedia',
  readFileSync(resolve(process.cwd(), 'lib/services/planOrchestratorResolve.js'), 'utf8').includes('mergeWithTrustedRegistryMedia')
);
check(
  'workoutPlanScaler clamps sets after scaleSetsToTarget',
  readFileSync(resolve(process.cwd(), 'lib/workoutPlanScaler.js'), 'utf8').includes('sets > 4')
);

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
