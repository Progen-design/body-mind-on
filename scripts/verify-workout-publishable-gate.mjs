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
            // Od 14. 9. 2026 jsou TRUSTED_EXERCISE_GIF_BY_KEY i
            // TRUSTED_EXTENDED_GIF_BY_KEY (lib/exerciseRegistryMedia.js) natrvalo
            // prázdné — žádný canonical_key už tu nemá natvrdo daný fallback gif.
            canonical_key: 'overhead_press',
            display_name_cs: 'Tlak nad hlavu',
            sets: 6,
            reps: '10',
            gif_url: null,
          },
          {
            canonical_key: 'hammer_curl',
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
check('gate caps overhead_press sets to max', exs[1].sets === MAX_PUBLISHABLE_WORKOUT_SETS);
check('gate keeps hammer_curl sets', exs[2].sets === 3);
// Gate už nefabrikuje gif_url pro cviky bez vlastní animace — cvik bez média
// smí do plánu (docs/DALSI_KROK.md 9.12). Ověřujeme, že se nic nevymyslí,
// ne že se doplní zastaralý Gym Visual odkaz.
check('gate nechává hip_thrust bez fabrikovaného gifu', exs[0].gif_url === null);
check('gate nechává overhead_press bez fabrikovaného gifu', exs[1].gif_url === null);
check('gate nechává hammer_curl bez fabrikovaného gifu', exs[2].gif_url === null);
check('gate reports sets_capped', stats.sets_capped >= 2, `sets_capped=${stats.sets_capped}`);
check('gate reports media_patched=0 (nic k fabrikaci)', stats.media_patched === 0, `media_patched=${stats.media_patched}`);

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
