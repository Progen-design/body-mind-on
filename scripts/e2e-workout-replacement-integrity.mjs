#!/usr/bin/env node
/**
 * E2E: workout replacement integrity on production (generate → confirm → restore).
 * BASE_URL=https://app.bodyandmindon.cz node scripts/e2e-workout-replacement-integrity.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  validateWorkoutExerciseIntegrity,
  displayNameImpliesSquat,
  isSquatMovementCanonical,
} from '../lib/exerciseIntegrity.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  for (const name of ['.env.production.local', '.env.local', '.env']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && process.env[m[1].trim()] === undefined) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
    break;
  }
}
loadEnv();

const BASE_URL = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const TEST_EMAIL = (process.env.E2E_EMAIL || 'janprikopa@gmail.com').trim().toLowerCase();

const admin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

let failed = 0;
function check(id, ok, detail = '') {
  if (ok) console.log(`OK ${id}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${id}${detail ? ` — ${detail}` : ''}`); }
}

async function getSessionToken() {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_EMAIL,
    options: { redirectTo: `${BASE_URL}/profil` },
  });
  if (error) throw error;
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
    token_hash: data?.properties?.hashed_token,
    type: 'magiclink',
  });
  if (otpErr || !otpData?.session?.access_token) throw otpErr || new Error('verifyOtp failed');
  return { token: otpData.session.access_token, userId: otpData.session.user.id };
}

async function api(token, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function main() {
  const { token, userId } = await getSessionToken();

  const { data: planRow } = await admin
    .from('ai_generated_plans')
    .select('id, structured_plan_json')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!planRow?.id) throw new Error('No plan for test user');

  const days = planRow.structured_plan_json?.days || [];
  const todayIso = '2026-07-13';
  const dayIdx = days.findIndex((d) => d.date === todayIso || Number(d.day_index) === 1);
  if (dayIdx < 0) throw new Error('Today day not found');

  const originalExercises = JSON.parse(JSON.stringify(days[dayIdx]?.workout?.exercises || []));
  const originalKeys = originalExercises.map((e) => e.canonical_key).filter(Boolean);

  const gen = await api(token, '/api/workout/replace-today', {
    plan_id: planRow.id,
    plan_day_index: dayIdx,
    selected_muscle_groups: ['chest', 'triceps'],
    training_location: 'gym',
    equipment_level: 'full_gym',
    duration_minutes: 30,
    intensity: 'medium',
  });

  check('replace-today HTTP 200', gen.res.status === 200, String(gen.res.status));
  const replacementId = gen.data?.replacement_id;
  check('replacement_id returned', Boolean(replacementId));

  const { data: replRow } = await admin
    .from('workout_replacements')
    .select('replacement_workout')
    .eq('id', replacementId)
    .maybeSingle();

  const genExercises = replRow?.replacement_workout?.exercises || [];
  const integrity = validateWorkoutExerciseIntegrity(genExercises);
  check('generated workout integrity', integrity.valid, integrity.issues.map((i) => i.code).join(', '));

  const genKeys = genExercises.map((e) => e.canonical_key);
  check('no duplicate canonical in generation', new Set(genKeys).size === genKeys.length);
  const wrongDrepy = genExercises.filter((ex) =>
    displayNameImpliesSquat(ex.display_name_cs || ex.name) && !isSquatMovementCanonical(ex.canonical_key)
  );
  check('no wrong Dřepy in generation', wrongDrepy.length === 0);

  const confirm = await api(token, '/api/workout/confirm-replacement', {
    replacement_id: replacementId,
    plan_id: planRow.id,
    plan_day_index: dayIdx,
  });
  check('confirm HTTP 200', confirm.res.status === 200, String(confirm.res.status));

  const { data: afterConfirm } = await admin
    .from('ai_generated_plans')
    .select('structured_plan_json')
    .eq('id', planRow.id)
    .single();

  const confirmedEx = afterConfirm?.structured_plan_json?.days?.[dayIdx]?.workout?.exercises || [];
  const confirmedKeys = confirmedEx.map((e) => e.canonical_key).filter(Boolean);
  check('confirm preserved canonical keys', confirmedKeys.length >= 2);
  check('confirm integrity', validateWorkoutExerciseIntegrity(confirmedEx).valid);

  const restore = await api(token, '/api/workout/restore-today', {
    plan_id: planRow.id,
    plan_day_index: dayIdx,
  });
  check('restore HTTP 200', restore.res.status === 200, String(restore.res.status));

  const { data: afterRestore } = await admin
    .from('ai_generated_plans')
    .select('structured_plan_json')
    .eq('id', planRow.id)
    .single();

  const restoredEx = afterRestore?.structured_plan_json?.days?.[dayIdx]?.workout?.exercises || [];
  const restoredKeys = restoredEx.map((e) => e.canonical_key).filter(Boolean);
  check('restore returned exercises', restoredKeys.length >= originalKeys.length);
  check('restore integrity', validateWorkoutExerciseIntegrity(restoredEx).valid);

  await admin.from('workout_replacements').delete().eq('id', replacementId);

  console.log(failed ? `\nE2E RESULT: FAIL (${failed})` : '\nE2E RESULT: PASS');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E fatal', e?.message || e);
  process.exit(1);
});
