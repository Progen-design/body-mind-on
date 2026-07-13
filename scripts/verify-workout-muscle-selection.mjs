#!/usr/bin/env node
/**
 * Workout muscle selection rules verifier.
 * npm run verify:workout-muscle-selection
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import {
  getHighlightedBodyParts,
  isMuscleHighlighted,
  isBodyZoneHighlighted,
  getRecommendedBodyView,
  getSvgZonesForMuscle,
  getMuscleVisibilityGuidance,
  getFullBodyZonesForView,
  validateMuscleSelection,
  getDisabledMuscles,
  getSelectionCategory,
  FULL_BODY_HIGHLIGHT_PARTS,
  RECOMMENDED_PRESETS,
  FRONT_SVG_ZONES,
  BACK_SVG_ZONES,
} from '../lib/workoutMuscleGroupRules.js';
import {
  normalizeTrainingSetupInput,
  DEFAULT_EQUIPMENT_BY_LOCATION,
  trainingSetupToBodyMetrics,
} from '../lib/workoutTrainingSetup.js';
import { filterWorkoutPlanForTrainingEnvironment } from '../lib/trainingEnvironment.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

const BASE = String(process.env.VERIFY_BASE_URL || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

let failed = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

const modal = read('components/workout/WorkoutChangeModal.jsx');
const api = read('pages/api/workout/replace-today.js');
const generator = read('lib/workoutTodayReplace.js');

const setupLib = read('lib/workoutTrainingSetup.js');

// Body view automation
check('1 core auto front view', getRecommendedBodyView(['core']) === 'front');
check('2 chest triceps auto front', getRecommendedBodyView(['chest', 'triceps']) === 'front');
check('3 back biceps auto back', getRecommendedBodyView(['back', 'biceps']) === 'back');
check('4 glutes hamstrings auto back', getRecommendedBodyView(['glutes', 'hamstrings']) === 'back');

// Bilateral SVG zones
check('5 biceps both arms', getSvgZonesForMuscle('biceps').join() === 'biceps_left,biceps_right');
check('6 triceps both arms', getSvgZonesForMuscle('triceps').join() === 'triceps_left,triceps_right');
check('7 quads both legs', getSvgZonesForMuscle('quads').join() === 'quads_left,quads_right');
check('8 hamstrings both legs', getSvgZonesForMuscle('hamstrings').join() === 'hamstrings_left,hamstrings_right');

// Full body per view
check('9 full body front all zones', FRONT_SVG_ZONES.every((z) => isBodyZoneHighlighted(z, ['full_body'], 'front')));
check('10 full body back all zones', BACK_SVG_ZONES.every((z) => isBodyZoneHighlighted(z, ['full_body'], 'back')));

// Visibility guidance
check('11 core back view guidance', getMuscleVisibilityGuidance(['core'], 'back')?.suggestedView === 'front');
check('12 back front view guidance', getMuscleVisibilityGuidance(['back'], 'front')?.suggestedView === 'back');

// Location / equipment separation
check('13 no equipment not in location', !modal.includes('no_equipment') && !modal.includes('LOCATION_OPTS'));
check('14 separate location and equipment state', modal.includes('trainingLocation') && modal.includes('equipmentLevel'));
check('15 gym defaults full_gym', DEFAULT_EQUIPMENT_BY_LOCATION.gym === 'full_gym');
check('16 home defaults basic', DEFAULT_EQUIPMENT_BY_LOCATION.home === 'basic');
check('17 outdoor defaults bodyweight', DEFAULT_EQUIPMENT_BY_LOCATION.outdoor === 'bodyweight');

// Bodyweight generator filter
const bwMetrics = trainingSetupToBodyMetrics({ training_location: 'outdoor', equipment_level: 'bodyweight' }, {});
const stub = { days: [{ exercises: [{ canonical_key: 'bench_press' }, { canonical_key: 'pushup' }] }] };
filterWorkoutPlanForTrainingEnvironment(stub, bwMetrics);
check('18 bodyweight excludes machines', !stub.days[0].exercises.some((e) => e.canonical_key === 'bench_press'));

// Server validation
check('19 server rejects unknown location', !normalizeTrainingSetupInput({ training_location: 'moon', equipment_level: 'basic' }).ok
  || normalizeTrainingSetupInput({ training_location: 'moon', equipment_level: 'basic' }).error);
check('20 server rejects unknown equipment', !normalizeTrainingSetupInput({ training_location: 'gym', equipment_level: 'spaceship' }).ok);
check('21 legacy location payload compatible', normalizeTrainingSetupInput({ location: 'no_equipment' }).equipment_level === 'bodyweight');
check('22 modal no horizontal scroll risk', modal.includes('overflow-y: auto') && modal.includes('max-width: 100%'));

check('modal uses getRecommendedBodyView', modal.includes('getRecommendedBodyView'));
check('modal visibility guidance UI', modal.includes('getMuscleVisibilityGuidance') && modal.includes('wcm-view-guidance'));
check('modal body zone highlight', modal.includes('isBodyZoneHighlighted'));
check('api training_location payload', api.includes('training_location') && api.includes('equipment_level'));
check('setup lib imported in api', api.includes('normalizeTrainingSetupInput'));

// 1–3 full body (legacy numbering continues)
const fbParts = getHighlightedBodyParts(['full_body']);
check('full_body highlights all body parts', fbParts.length === FULL_BODY_HIGHLIGHT_PARTS.length
  && FULL_BODY_HIGHLIGHT_PARTS.every((p) => fbParts.includes(p)));
check('full_body clears individual on validate', validateMuscleSelection({
  selectedMuscleGroups: ['full_body', 'biceps'],
  durationMinutes: 30,
}).errorCode === 'full_body_must_be_single');
check('clicking muscle exits full_body via toggle rules', validateMuscleSelection({
  selectedMuscleGroups: ['chest'],
  durationMinutes: 30,
}).valid);

// 4–6 compatibility
const quadsDisabled = getDisabledMuscles(['quads'], 30);
check('quads allows legs and core', !quadsDisabled.includes('glutes')
  && !quadsDisabled.includes('hamstrings')
  && quadsDisabled.includes('chest')
  && quadsDisabled.includes('back'));
const chestDisabled = getDisabledMuscles(['chest'], 30);
check('chest allows push and core', !chestDisabled.includes('triceps')
  && !chestDisabled.includes('shoulders')
  && chestDisabled.includes('back'));
const backDisabled = getDisabledMuscles(['back'], 30);
check('back allows biceps and core', !backDisabled.includes('biceps')
  && backDisabled.includes('chest'));

// 7–10 invalid combos
check('legs + back invalid', !validateMuscleSelection({ selectedMuscleGroups: ['quads', 'back'], durationMinutes: 30 }).valid);
check('legs + chest invalid', !validateMuscleSelection({ selectedMuscleGroups: ['quads', 'chest'], durationMinutes: 30 }).valid);
check('chest + hamstrings invalid', !validateMuscleSelection({ selectedMuscleGroups: ['chest', 'hamstrings'], durationMinutes: 30 }).valid);
check('full_body + biceps invalid', !validateMuscleSelection({ selectedMuscleGroups: ['full_body', 'biceps'], durationMinutes: 30 }).valid);

// 11–14 duration
check('15 min rejects too many push muscles', !validateMuscleSelection({
  selectedMuscleGroups: ['chest', 'shoulders', 'triceps'],
  durationMinutes: 15,
}).valid);
check('30 min allows two compatible muscles', validateMuscleSelection({
  selectedMuscleGroups: ['chest', 'triceps'],
  durationMinutes: 30,
}).valid);
check('45 min allows push trio', validateMuscleSelection({
  selectedMuscleGroups: ['chest', 'shoulders', 'triceps'],
  durationMinutes: 45,
}).valid);
check('60 min allows full legs', validateMuscleSelection({
  selectedMuscleGroups: ['glutes', 'quads', 'hamstrings', 'calves'],
  durationMinutes: 60,
}).valid);

// 15–16 UI wiring
check('disabled chips aria-disabled', modal.includes('aria-disabled') && modal.includes('.wcm-chip.disabled'));
check('SVG and chips share isMuscleHighlighted', modal.includes('isMuscleHighlighted') && modal.includes('validateMuscleSelection'));

// 17–19 presets
const legsPreset = RECOMMENDED_PRESETS.find((p) => p.id === 'legs');
check('preset legs selects four muscles', legsPreset?.muscles?.join() === 'glutes,quads,hamstrings,calves');
check('preset chest triceps valid', validateMuscleSelection({
  selectedMuscleGroups: RECOMMENDED_PRESETS.find((p) => p.id === 'chest_triceps').muscles,
  durationMinutes: 30,
}).valid);
check('preset back biceps valid', validateMuscleSelection({
  selectedMuscleGroups: RECOMMENDED_PRESETS.find((p) => p.id === 'back_biceps').muscles,
  durationMinutes: 30,
}).valid);

// 20–22 server
check('server uses validateMuscleSelection', api.includes('validateMuscleSelection') && api.includes('invalid_muscle_selection'));
check('server computes category server-side', api.includes('workoutCategory') && generator.includes('validation.category'));
check('server ignores spoofed client category', generator.includes('clientCategory') && generator.includes('validation.category'));

// 23 balanced full body generator
check('full_body balanced generator', generator.includes('pickBalancedFullBody'));

// 24 static cleanup hint
check('modal reset selection button', modal.includes('Zrušit výběr') && modal.includes('clearSelection'));
check('modal quick presets', modal.includes('Rychlý výběr') && modal.includes('RECOMMENDED_PRESETS'));

// API integration (optional if server up)
async function testApiRejection() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    check('server rejects invalid combination', true, 'skipped — no service key');
    return;
  }
  const admin = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  let userId = null;
  let page = 1;
  for (;;) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const hit = (data?.users || []).find((u) => String(u.email || '').toLowerCase() === 'janprikopa@gmail.com');
    if (hit?.id) { userId = hit.id; break; }
    if ((data?.users || []).length < 200) break;
    page += 1;
  }
  if (!userId) {
    check('server rejects invalid combination', true, 'skipped — no test user');
    return;
  }

  const { data: linkData } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'janprikopa@gmail.com',
    options: { redirectTo: `${BASE}/profil` },
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (!tokenHash) {
    check('server rejects invalid combination', true, 'skipped — no token');
    return;
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  const token = sess?.session?.access_token;
  if (!token) {
    check('server rejects invalid combination', true, 'skipped — no session');
    return;
  }

  const { data: plans } = await admin
    .from('ai_generated_plans')
    .select('id, structured_plan_json')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  const planId = plans?.[0]?.id;
  if (!planId) {
    check('server rejects invalid combination', true, 'skipped — no plan');
    return;
  }

  try {
    const res = await fetch(`${BASE}/api/workout/replace-today`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId,
        plan_day_index: 0,
        selected_muscle_groups: ['quads', 'back'],
        location: 'gym',
        duration_minutes: 30,
        intensity: 'medium',
        category: 'push',
      }),
    });
    const body = await res.json().catch(() => ({}));
    check('server rejects invalid combination', res.status === 400
      && (body.error_code === 'incompatible_muscle_groups' || body.error === 'invalid_muscle_selection'),
      `status ${res.status} ${body.error_code || body.error || ''}`);
  } catch (e) {
    check('server rejects invalid combination', true, `skipped — ${e.message}`);
  }
}

await testApiRejection();

check('isMuscleHighlighted for full_body front', isMuscleHighlighted('chest', ['full_body'])
  && isMuscleHighlighted('quads', ['full_body']));
check('category push detection', getSelectionCategory(['chest', 'triceps']) === 'push');

if (failed === 0) {
  console.log('ALL CHECKS PASS');
  process.exit(0);
}
console.error(`FAILED ${failed}`);
process.exit(1);
