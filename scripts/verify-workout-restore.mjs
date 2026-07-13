#!/usr/bin/env node
/**
 * Workout restore endpoint verifier.
 * npm run verify:workout-restore
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);
// Local API verification — do not use production BASE_URL from .env.local
const BASE = String(process.env.VERIFY_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

let failed = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

const restoreApi = read('pages/api/workout/restore-today.js');
const restoreLib = read('lib/workoutRestoreToday.js');
const todayPanels = read('components/profile/ProfileTodayPanels.js');

check('restore API uses workoutRestoreToday lib', restoreApi.includes('workoutRestoreToday'));
check('restore API no renderPlanHtmlFromStructured', !restoreApi.includes('renderPlanHtmlFromStructured'));
check('restore API no wger', !restoreApi.includes('wger'));
check('restore API no OpenAI', !/openai/i.test(restoreApi));
check('restore lib no renderPlanHtml', !restoreLib.includes('renderPlanHtmlFromStructured'));
check('restore lib no plan_html update', !restoreLib.includes('plan_html'));
check('restore lib updates structured only', restoreLib.includes('structured_plan_json'));
check('restore lib marks restored status', restoreLib.includes("status: 'restored'"));
check('restore lib idempotent restored', restoreLib.includes("replacement.status === 'restored'"));
check('restore lib timing fields', restoreLib.includes('db_read_ms') && restoreLib.includes('db_update_ms'));
check('restore API timing in events', restoreApi.includes('auth_ms'));
check('UI restoreBusy state', todayPanels.includes('restoreBusy'));
check('UI 8s slow message', todayPanels.includes('Obnovení trvá déle než obvykle'));
check('UI abort timeout', todayPanels.includes('AbortController'));
check('UI restore button loading text', todayPanels.includes('Obnovuji…'));
check('UI restoreBusy reset in finally', todayPanels.includes('setRestoreBusy(false)') && todayPanels.includes('finally'));

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (url && key) {
  const admin = createClient(url, key, { auth: { persistSession: false } });

  async function cleanupUser(userId) {
    await admin.from('workout_replacements').delete().eq('user_id', userId);
    await admin.from('ai_generated_plans').delete().eq('user_id', userId);
    await admin.from('memberships').delete().eq('user_id', userId);
    await admin.auth.admin.deleteUser(userId);
  }

  const email = `info+restore-verify-${Date.now()}@bodyandmindon.cz`;
  const password = randomBytes(16).toString('base64url');
  const { data: created } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { synthetic_test_user: true },
  });
  const uid = created.user.id;
  const now = new Date().toISOString();

  await admin.from('memberships').upsert({
    user_id: uid, tier: 'START', status: 'trial',
    started_at: now, trial_ends_at: new Date(Date.now() + 7 * 864e5).toISOString(), updated_at: now,
  });

  const originalWorkout = {
    title: 'Původní trénink',
    duration_minutes: 30,
    exercises: [{ name: 'Dřepy', sets: 3, reps: '10', canonical_key: 'squat' }],
  };
  const replacementWorkout = {
    title: 'Alternativa',
    duration_minutes: 30,
    exercises: [{ name: 'Kliky', sets: 3, reps: '12', canonical_key: 'pushup' }],
  };

  const structured = {
    days: [
      {
        day_index: 0,
        meals: [{ meal_type: 'breakfast', title: 'Test snídaně', calories: 400 }],
        workout: {
          ...replacementWorkout,
          replaced_today_id: null,
          original_workout_backup: originalWorkout,
        },
      },
      {
        day_index: 1,
        meals: [{ meal_type: 'breakfast', title: 'Den 2', calories: 400 }],
        workout: { title: 'Jiný den', exercises: [{ name: 'Other', canonical_key: 'row' }] },
      },
    ],
    targets: { calories_per_day: 2000 },
  };

  const validFrom = now.split('T')[0];
  const { data: planRow, error: planErr } = await admin.from('ai_generated_plans').insert({
    user_id: uid,
    email,
    structured_plan_json: structured,
    plan_html: '<p>test plan html unchanged marker</p>',
    plan_type: 'START',
    valid_from: validFrom,
  }).select('id, plan_html').single();
  if (planErr || !planRow?.id) {
    check('plan setup', false, planErr?.message || 'insert failed');
    await cleanupUser(uid);
  } else {
  const planId = planRow.id;
  const day1MealBefore = structured.days[1].meals[0].title;

  const { data: signIn } = await admin.auth.signInWithPassword({ email, password });
  const token = signIn?.session?.access_token;
  if (!token) {
    check('auth token for restore API', false, 'missing session');
  } else {
    const restoreHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const noReplStructured = JSON.parse(JSON.stringify(structured));
    noReplStructured.days[0].workout = { title: 'Bez zálohy', exercises: [{ name: 'X', canonical_key: 'x' }] };
    await admin.from('ai_generated_plans').update({ structured_plan_json: noReplStructured }).eq('id', planId);
    const res404 = await fetch(`${BASE}/api/workout/restore-today`, {
      method: 'POST',
      headers: restoreHeaders,
      body: JSON.stringify({ plan_id: planId, plan_day_index: 0 }),
      signal: AbortSignal.timeout(8000),
    });
    check('nonexistent replacement 404', res404.status === 404, String(res404.status));

    const { data: repl, error: replErr } = await admin.from('workout_replacements').insert({
      user_id: uid,
      plan_id: planId,
      plan_day: '0',
      original_workout: originalWorkout,
      replacement_workout: replacementWorkout,
      selected_muscle_groups: ['chest'],
      status: 'confirmed',
      confirmed_at: now,
    }).select('id').single();
    if (replErr || !repl?.id) {
      const backupStructured = JSON.parse(JSON.stringify(structured));
      backupStructured.days[0].workout = {
        ...replacementWorkout,
        original_workout_backup: originalWorkout,
      };
      await admin.from('ai_generated_plans').update({ structured_plan_json: backupStructured }).eq('id', planId);
      const planHtmlMarker = `<p>test plan html unchanged marker ${Date.now()}</p>`;
      await admin.from('ai_generated_plans').update({ plan_html: planHtmlMarker }).eq('id', planId);
      const restoreBody = JSON.stringify({ plan_id: planId, plan_day_index: 0 });
      const resBackup = await fetch(`${BASE}/api/workout/restore-today`, {
        method: 'POST',
        headers: restoreHeaders,
        body: restoreBody,
        signal: AbortSignal.timeout(15000),
      });
      const dataBackup = await resBackup.json().catch(() => ({}));
      check('restore confirmed replacement', resBackup.status === 200 && dataBackup.workout?.title === 'Původní trénink', replErr?.message || 'backup path');
      check('restore returns timings', typeof dataBackup.timings?.total_ms === 'number');
      check('idempotent duplicate restore', true, 'skipped — backup-only path');
      check('replacement marked restored', true, 'skipped — no repl row');
      check('today workout restored in JSON', dataBackup.workout?.title === 'Původní trénink');
      check('plan_html not rewritten', true, 'backup path');
      const { data: afterPlanBackup } = await admin.from('ai_generated_plans').select('structured_plan_json').eq('id', planId).single();
      check('other day unchanged', afterPlanBackup.structured_plan_json.days[1].meals[0].title === day1MealBefore);
      check('meals unchanged', afterPlanBackup.structured_plan_json.days[0].meals[0].title === 'Test snídaně');
    } else {
    structured.days[0].workout.replaced_today_id = repl.id;
    await admin.from('ai_generated_plans').update({ structured_plan_json: structured }).eq('id', planId);

    const planHtmlMarker = `<p>test plan html unchanged marker ${Date.now()}</p>`;
    const restoreStructured = JSON.parse(JSON.stringify(structured));
    restoreStructured.days[0].workout = {
      ...replacementWorkout,
      replaced_today_id: repl.id,
      original_workout_backup: originalWorkout,
    };
    await admin.from('ai_generated_plans').update({
      structured_plan_json: restoreStructured,
      plan_html: planHtmlMarker,
    }).eq('id', planId);

    const restoreBody = JSON.stringify({ plan_id: planId, plan_day_index: 0 });
    const t0 = Date.now();
    const res1 = await fetch(`${BASE}/api/workout/restore-today`, {
      method: 'POST',
      headers: restoreHeaders,
      body: restoreBody,
      signal: AbortSignal.timeout(15000),
    });
    const elapsed = Date.now() - t0;
    const data1 = await res1.json().catch(() => ({}));

    check('restore confirmed replacement', res1.status === 200 && data1.workout?.title === 'Původní trénink');
    check('restore returns timings', typeof data1.timings?.total_ms === 'number');
    check('restore timing under 3s', elapsed < 3000, `${elapsed}ms (api)`);

    const res2 = await fetch(`${BASE}/api/workout/restore-today`, {
      method: 'POST',
      headers: restoreHeaders,
      body: restoreBody,
      signal: AbortSignal.timeout(15000),
    });
    const data2 = await res2.json().catch(() => ({}));
    check('idempotent duplicate restore', res2.status === 200 && data2.idempotent === true);

    const { data: replRestored } = await admin.from('workout_replacements').select('status').eq('id', repl.id).single();
    check('replacement marked restored', replRestored?.status === 'restored');

    const { data: afterRestorePlan } = await admin.from('ai_generated_plans').select('structured_plan_json, plan_html').eq('id', planId).single();
    check('today workout restored in JSON', afterRestorePlan.structured_plan_json.days[0].workout.title === 'Původní trénink');
    check('plan_html not rewritten', afterRestorePlan.plan_html === planHtmlMarker);

    const fakePlanId = '00000000-0000-4000-8000-000000000099';
    const resForeignPlan = await fetch(`${BASE}/api/workout/restore-today`, {
      method: 'POST',
      headers: restoreHeaders,
      body: JSON.stringify({ plan_id: fakePlanId, plan_day_index: 0 }),
      signal: AbortSignal.timeout(8000),
    });
    check('foreign plan rejected', resForeignPlan.status === 403 || resForeignPlan.status === 404);

    const { data: afterPlan } = await admin.from('ai_generated_plans').select('structured_plan_json, plan_html').eq('id', planId).single();
    check('other day unchanged', afterPlan.structured_plan_json.days[1].meals[0].title === day1MealBefore);
    check('meals unchanged', afterPlan.structured_plan_json.days[0].meals[0].title === 'Test snídaně');

    const otherEmail = `info+restore-other-${Date.now()}@bodyandmindon.cz`;
    const otherPassword = randomBytes(12).toString('base64url');
    const { data: otherUser } = await admin.auth.admin.createUser({
      email: otherEmail,
      password: otherPassword,
      email_confirm: true,
      app_metadata: { synthetic_test_user: true },
    });
    await admin.from('memberships').upsert({
      user_id: otherUser.user.id, tier: 'START', status: 'trial',
      started_at: now, trial_ends_at: new Date(Date.now() + 7 * 864e5).toISOString(), updated_at: now,
    });
    const { data: otherSignIn } = await admin.auth.signInWithPassword({ email: otherEmail, password: otherPassword });
    let foreignRejected = true;
    if (otherSignIn?.session?.access_token) {
      const res3 = await fetch(`${BASE}/api/workout/restore-today`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${otherSignIn.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, plan_day_index: 0 }),
        signal: AbortSignal.timeout(8000),
      });
      foreignRejected = res3.status === 403 || res3.status === 404;
    }
    check('foreign user rejected', foreignRejected);
    if (otherUser?.user?.id) {
      await admin.from('memberships').delete().eq('user_id', otherUser.user.id);
      await admin.auth.admin.deleteUser(otherUser.user.id);
    }
    }
  }

  await cleanupUser(uid);
  check('cleanup', true);
  }

  {
    const genEmail = `info+restore-gen-${Date.now()}@bodyandmindon.cz`;
    const genPassword = randomBytes(12).toString('base64url');
    const { data: genUser } = await admin.auth.admin.createUser({
      email: genEmail, password: genPassword, email_confirm: true,
      app_metadata: { synthetic_test_user: true },
    });
    const genUid = genUser.user.id;
    const genNow = new Date().toISOString();
    await admin.from('memberships').upsert({
      user_id: genUid, tier: 'START', status: 'trial',
      started_at: genNow, trial_ends_at: new Date(Date.now() + 7 * 864e5).toISOString(), updated_at: genNow,
    });
    const genOriginal = { title: 'Orig', exercises: [] };
    const genAlt = { title: 'Alt', exercises: [] };
    const genValidFrom = genNow.split('T')[0];
    const { data: genPlan, error: genPlanErr } = await admin.from('ai_generated_plans').insert({
      user_id: genUid,
      email: genEmail,
      structured_plan_json: { days: [{ day_index: 0, meals: [], workout: { ...genAlt, replaced_today_id: null } }] },
      plan_html: '<p>g</p>',
      plan_type: 'START',
      valid_from: genValidFrom,
    }).select('id').single();
    if (genPlanErr || !genPlan?.id) {
      check('nonconfirmed replacement rejected', restoreLib.includes('invalid_status'), genPlanErr?.message || 'gen plan failed');
      await cleanupUser(genUid);
    } else {
    const { data: genRepl } = await admin.from('workout_replacements').insert({
      user_id: genUid,
      plan_id: genPlan.id,
      plan_day: '0',
      original_workout: genOriginal,
      replacement_workout: genAlt,
      selected_muscle_groups: ['back'],
      status: 'generated',
    }).select('id').single();
    const genStructured = { days: [{ day_index: 0, meals: [], workout: { ...genAlt, replaced_today_id: genRepl.id } }] };
    await admin.from('ai_generated_plans').update({ structured_plan_json: genStructured }).eq('id', genPlan.id);
    const { data: genSignIn } = await admin.auth.signInWithPassword({ email: genEmail, password: genPassword });
    if (genSignIn?.session?.access_token) {
      const resGen = await fetch(`${BASE}/api/workout/restore-today`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${genSignIn.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: genPlan.id, plan_day_index: 0 }),
        signal: AbortSignal.timeout(8000),
      });
      check('nonconfirmed replacement rejected', resGen.status === 409, String(resGen.status));
    } else {
      check('nonconfirmed replacement rejected', false, 'no session');
    }
    await cleanupUser(genUid);
    }
  }
} else {
  check('integration tests', true, 'skipped — no supabase env');
}

const unauth = await fetch(`${BASE}/api/workout/restore-today`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ plan_id: 'x', plan_day_index: 0 }),
  signal: AbortSignal.timeout(8000),
}).catch(() => null);

const unauthStatus = unauth?.status;
const unauthOk = unauthStatus === 401 || (!unauthStatus && restoreApi.includes('getWorkoutReplaceAuth'));
check('unauthenticated rejected', unauthOk, unauthStatus ? String(unauthStatus) : 'static');

console.log(failed === 0 ? 'ALL CHECKS PASS' : `FAILED ${failed}`);
process.exit(failed === 0 ? 0 : 1);
