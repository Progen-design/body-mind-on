#!/usr/bin/env node
/**
 * Exercise identity & mapping integrity verifier.
 * npm run verify:exercise-integrity
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import {
  resolveToCanonicalKey,
  getCanonicalExercise,
  CANONICAL_EXERCISES,
} from '../lib/exerciseCanonicalMap.js';
import {
  exerciseDisplayNameMatchesCanonical,
  normalizeExerciseDisplayFromCanonical,
  validateWorkoutExerciseIntegrity,
  displayNameImpliesSquat,
  isSquatMovementCanonical,
  isNonSquatMislabeledAsSquat,
  EXERCISE_MEDIA_PLACEHOLDER_CS,
  canonicalDisplayLabel,
} from '../lib/exerciseIntegrity.js';
import { toStructuredDayWorkout } from '../lib/workoutReplacementSchema.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

let failed = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

const planViewer = fs.readFileSync(path.join(ROOT, 'components/PlanViewer.js'), 'utf8');
const exerciseMediaApi = fs.readFileSync(path.join(ROOT, 'pages/api/exercise-media.js'), 'utf8');
const confirmApi = fs.readFileSync(path.join(ROOT, 'pages/api/workout/confirm-replacement.js'), 'utf8');
const replaceLib = fs.readFileSync(path.join(ROOT, 'lib/workoutTodayReplace.js'), 'utf8');

console.log('--- canonical ID as primary identity ---');
check('PlanViewer modal loads media by canonical_key', /canonicalKey/.test(planViewer) && /fetchExerciseMediaFromApi/.test(planViewer));
check('exercise-media API accepts canonical_key', /canonical_key/.test(exerciseMediaApi));
check('workout replace passes canonicalKey to resolveExercise', /canonicalKey/.test(replaceLib));
check('confirm normalizes exercise display from canonical', /normalizeExerciseDisplayFromCanonical/.test(confirmApi));
check('every canonical exercise has stable key', Object.keys(CANONICAL_EXERCISES).every((k) => CANONICAL_EXERCISES[k].canonical_key === k));

console.log('\n--- squat vs press mapping ---');
const squatOnly = ['Dřepy', 'Goblet dřep', 'squat', 'front squat'];
const mustNotBeSquat = [
  ['Chest press', 'chest_press'],
  ['Leg press', 'leg_press'],
  ['Tlaky nad hlavu', 'overhead_press'],
  ['Shoulder press', 'overhead_press'],
  ['Pullover', null],
];
for (const label of squatOnly) {
  const key = resolveToCanonicalKey(label);
  check(`${label} maps to squat movement`, isSquatMovementCanonical(key) || key === 'lunges', key || 'null');
}
for (const [label, expected] of mustNotBeSquat) {
  const key = resolveToCanonicalKey(label);
  if (expected) {
    check(`${label} is not squat`, key === expected && !isSquatMovementCanonical(key), key || 'null');
  } else if (key) {
    check(`${label} is not squat`, !isSquatMovementCanonical(key), key);
  } else {
    check(`${label} has no squat mapping`, true);
  }
}
check('chest press resolves to chest_press not squat', resolveToCanonicalKey('Chest press') === 'chest_press');
check('leg press resolves to leg_press not squat', resolveToCanonicalKey('Leg press') === 'leg_press');
check('shoulder press resolves to overhead_press not squat', resolveToCanonicalKey('Shoulder press') === 'overhead_press');
check('mislabel detector flags chest_press+Dřepy', isNonSquatMislabeledAsSquat('chest_press', 'Dřepy'));
check('mislabel detector flags leg_press+Dřepy', isNonSquatMislabeledAsSquat('leg_press', 'Dřepy'));
check('mislabel detector flags overhead_press+Dřepy', isNonSquatMislabeledAsSquat('overhead_press', 'Dřepy'));

console.log('\n--- display name integrity ---');
const badOverhead = { canonical_key: 'overhead_press', display_name_cs: 'Dřepy' };
const badTriceps = { canonical_key: 'tricep_extension', display_name_cs: 'Dřepy' };
check('detect squat label on overhead press', !exerciseDisplayNameMatchesCanonical(badOverhead).ok);
check('detect squat label on triceps', !exerciseDisplayNameMatchesCanonical(badTriceps).ok);
const fixedOverhead = normalizeExerciseDisplayFromCanonical(badOverhead);
check('normalize fixes overhead label', fixedOverhead.display_name_cs === canonicalDisplayLabel('overhead_press'));
const fixedTriceps = normalizeExerciseDisplayFromCanonical(badTriceps);
check('normalize fixes triceps label', fixedTriceps.display_name_cs === canonicalDisplayLabel('tricep_extension'));

console.log('\n--- workout duplicate canonical keys ---');
const dupWorkout = [
  { canonical_key: 'chest_press', display_name_cs: 'Chest press' },
  { canonical_key: 'tricep_extension', display_name_cs: 'Dřepy' },
  { canonical_key: 'tricep_extension', display_name_cs: 'Dřepy' },
];
check('duplicate canonical detected', !validateWorkoutExerciseIntegrity(dupWorkout).valid);
check('wrong Dřepy pair detected', validateWorkoutExerciseIntegrity(dupWorkout).issues.some((i) => i.code === 'squat_label_on_non_squat' || i.code === 'duplicate_wrong_drepy_labels' || i.code === 'duplicate_canonical_key'));

console.log('\n--- image / placeholder UX ---');
check('placeholder copy defined', EXERCISE_MEDIA_PLACEHOLDER_CS.includes('není k dispozici'));
check('PlanViewer shows placeholder when no media', planViewer.includes('EXERCISE_MEDIA_PLACEHOLDER_CS'));
check('PlanViewer blocks media on name mismatch', /exerciseDisplayNameMatchesCanonical/.test(planViewer));

console.log('\n--- workout replacement ID preservation ---');
const previewWorkout = {
  duration_minutes: 30,
  title: 'Test',
  focus: ['chest', 'triceps'],
  exercises: [
    { canonical_key: 'chest_press', name: 'Chest press', sets: 3, reps: '10' },
    { canonical_key: 'tricep_extension', name: 'Tricepsové tlaky', sets: 3, reps: '12' },
  ],
};
const structured = toStructuredDayWorkout(previewWorkout);
check('confirm schema keeps canonical_key', structured.exercises.every((ex) => ex.canonical_key));
check('confirm schema keeps wger slot', 'wger_exercise_id' in structured.exercises[0]);

console.log('\n--- generator integrity (static + sample) ---');
check('generator passes canonicalKey to resolveExercise', /canonicalKey/.test(replaceLib));
check('generator normalizes display from canonical', /normalizeExerciseDisplayFromCanonical/.test(replaceLib));
check('generator validates workout integrity', /validateWorkoutExerciseIntegrity/.test(replaceLib));
const samplePush = [
  { canonical_key: 'chest_press', display_name_cs: 'Chest press', wger_exercise_id: 1948 },
  { canonical_key: 'tricep_extension', display_name_cs: 'Tricepsové tlaky', wger_exercise_id: 139 },
  { canonical_key: 'overhead_press', display_name_cs: 'Tlaky nad hlavu', wger_exercise_id: 85 },
];
check('sample push workout passes integrity', validateWorkoutExerciseIntegrity(samplePush).valid);
check('sample push has no wrong Dřepy', samplePush.every((ex) =>
  !displayNameImpliesSquat(ex.display_name_cs) || isSquatMovementCanonical(ex.canonical_key)
));

console.log('\n--- production plan audit (optional) ---');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const auditEmail = String(process.env.E2E_EMAIL || 'janprikopa@gmail.com').trim().toLowerCase();
if (url && key) {
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = (users?.users || []).find((u) => String(u.email || '').toLowerCase() === auditEmail);
  if (user?.id) {
    const { data: planRow } = await admin
      .from('ai_generated_plans')
      .select('id, structured_plan_json')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const days = planRow?.structured_plan_json?.days || [];
    const todayIso = '2026-07-13';
    const todayDay = days.find((d) => d.date === todayIso) || days.find((d) => Number(d.day_index) === 1);
    const exercises = todayDay?.workout?.exercises || [];
    if (exercises.length) {
      const integrity = validateWorkoutExerciseIntegrity(exercises);
      const drepy = exercises.filter((ex) => displayNameImpliesSquat(ex.display_name_cs || ex.name_cs || ex.name));
      check('production today workout integrity', integrity.valid, integrity.issues.map((i) => i.code).join(', ') || `${exercises.length} exercises`);
      check('production no duplicate wrong Dřepy', !(drepy.length >= 2 && drepy.some((ex) => !isSquatMovementCanonical(ex.canonical_key))));
      for (const ex of exercises) {
        const label = ex.display_name_cs || ex.name_cs || ex.name;
        const keyName = ex.canonical_key || '—';
        console.log(`  audit exercise: ${keyName} / ${label}`);
      }
    } else {
      console.log('WARN production today workout empty — skipped');
    }
  } else {
    console.log('WARN audit user not found — skipped');
  }
} else {
  console.log('WARN SUPABASE env missing — production audit skipped');
}

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
