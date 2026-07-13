#!/usr/bin/env node
/**
 * Sanitize today's workout exercises on beta test account (display names + wger IDs).
 * npm run ops:sanitize-beta-today-workout
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeExerciseDisplayFromCanonical,
  validateWorkoutExerciseIntegrity,
} from '../lib/exerciseIntegrity.js';
import { normalizePublishableWorkoutExercisesInPlan } from '../lib/planDataIntegrity.js';
import { getCanonicalExercise } from '../lib/exerciseCanonicalMap.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const auditEmail = String(process.env.E2E_EMAIL || 'janprikopa@gmail.com').trim().toLowerCase();
const todayIso = process.env.OPS_TODAY_ISO || '2026-07-13';

if (!url || !key) {
  console.error('FAIL SUPABASE env required');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function registryWgerId(canonicalKey) {
  const { data } = await admin
    .from('exercise_asset_registry')
    .select('wger_exercise_id')
    .eq('canonical_key', canonicalKey)
    .maybeSingle();
  const id = data?.wger_exercise_id != null ? Number(data.wger_exercise_id) : null;
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function main() {
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = (users?.users || []).find((u) => String(u.email || '').toLowerCase() === auditEmail);
  if (!user?.id) {
    console.error('FAIL user not found');
    process.exit(1);
  }

  const { data: planRow, error } = await admin
    .from('ai_generated_plans')
    .select('id, structured_plan_json')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !planRow?.structured_plan_json) {
    console.error('FAIL plan load', error?.message);
    process.exit(1);
  }

  const structured = planRow.structured_plan_json;
  const dayIdx = structured.days.findIndex((d) => d.date === todayIso || Number(d.day_index) === 1);
  if (dayIdx < 0 || !structured.days[dayIdx]?.workout?.exercises?.length) {
    console.error('FAIL today workout not found');
    process.exit(1);
  }

  const before = validateWorkoutExerciseIntegrity(structured.days[dayIdx].workout.exercises);
  console.log('before integrity:', before.valid ? 'PASS' : 'FAIL', before.issues.length ? JSON.stringify(before.issues) : '');

  const fixed = [];
  for (const ex of structured.days[dayIdx].workout.exercises) {
    let next = normalizeExerciseDisplayFromCanonical(ex);
    const ck = String(next.canonical_key || '').toLowerCase();
    const regId = ck ? await registryWgerId(ck) : null;
    if (regId) next = { ...next, wger_exercise_id: regId };
    fixed.push(next);
  }

  structured.days[dayIdx].workout.exercises = fixed;
  normalizePublishableWorkoutExercisesInPlan(structured);

  const after = validateWorkoutExerciseIntegrity(structured.days[dayIdx].workout.exercises);
  console.log('after integrity:', after.valid ? 'PASS' : 'FAIL', after.issues.length ? JSON.stringify(after.issues) : '');

  if (!after.valid) {
    console.error('FAIL still invalid after sanitize');
    process.exit(1);
  }

  const { error: updErr } = await admin
    .from('ai_generated_plans')
    .update({ structured_plan_json: structured })
    .eq('id', planRow.id);

  if (updErr) {
    console.error('FAIL update', updErr.message);
    process.exit(1);
  }

  console.log('OK sanitized today workout for plan', planRow.id);
  for (const ex of structured.days[dayIdx].workout.exercises) {
    const def = getCanonicalExercise(ex.canonical_key);
    console.log(`  ${ex.canonical_key}: ${ex.display_name_cs} (wger ${ex.wger_exercise_id ?? '—'}) expected ${def?.display_name_cs || '—'}`);
  }
}

main().catch((e) => {
  console.error('FAIL', e?.message || e);
  process.exit(1);
});
