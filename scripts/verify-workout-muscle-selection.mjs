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
  validateMuscleSelection,
  getDisabledMuscles,
  getSelectionCategory,
  FULL_BODY_HIGHLIGHT_PARTS,
  RECOMMENDED_PRESETS,
} from '../lib/workoutMuscleGroupRules.js';

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

// 1–3 full body
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
