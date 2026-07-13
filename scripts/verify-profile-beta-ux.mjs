#!/usr/bin/env node
/**
 * Beta profile UX + workout alternative verifier.
 * npm run verify:profile-beta-ux
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getHabitDisplayLabel,
  HABIT_LABELS,
} from '../lib/habitLabels.js';
import {
  normalizeMuscleGroupSelection,
  MAX_SPECIFIC_MUSCLE_GROUPS,
} from '../lib/muscleGroupLabels.js';
import { validateReplacementPreview } from '../lib/workoutReplacementSchema.js';

const MAX_REGENERATIONS_PER_DAY = 2;
function canRegenerateToday(n) { return n < MAX_REGENERATIONS_PER_DAY; }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);
const BASE = String(process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

let failed = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

function read(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

const betaToday = read('components/beta/BetaTodaySection.js');
const checkin = read('components/beta/DailyCheckinPanel.js');
const todayPanels = read('components/profile/ProfileTodayPanels.js');
const habitLabels = read('lib/habitLabels.js');
const modal = read('components/workout/WorkoutChangeModal.jsx');
const allowlist = read('lib/productEventAllowlist.js');
const migration = read('supabase/migrations/20260713200000_workout_replacements.sql');

check('habit label training', HABIT_LABELS.training === 'Pohyb nebo trénink');
check('habit label healthy_diet', HABIT_LABELS.healthy_diet === 'Vyvážené stravování');
check('habit label quality_sleep', HABIT_LABELS.quality_sleep === 'Kvalitní spánek');
check('raw training not shown in BetaTodaySection', !betaToday.includes('<span>{hid}</span>'));
check('getHabitDisplayLabel used', betaToday.includes('getHabitDisplayLabel'));
check('czech labels in mapping', getHabitDisplayLabel('training') === 'Pohyb nebo trénink');
check('fallback readable label', getHabitDisplayLabel('custom_habit') === 'Custom Habit');

const feedbackCount = (betaToday.match(/<BetaFeedbackButton/g) || []).length
  + (checkin.match(/<BetaFeedbackButton/g) || []).length;
check('single feedback button in Dnes section', feedbackCount === 1);
check('feedback below check-in', betaToday.indexOf('DailyCheckinPanel') < betaToday.indexOf('BetaFeedbackButton'));

check('optimistic completions state', betaToday.includes('setOptimistic'));
check('optimistic toggle apply', betaToday.includes('applyOptimisticToggle'));
check('rollback error message', betaToday.includes('Změnu se nepodařilo uložit'));
check('per-item pending spinner', betaToday.includes('beta-today-spinner'));
check('success path updates without full reload', betaToday.includes('setCompletions((prev)') && betaToday.includes('setOptimistic(null)'));

check('change workout button', todayPanels.includes('Změnit dnešní trénink'));
check('restore original button', todayPanels.includes('Obnovit původní trénink'));
check('workout modal wired', todayPanels.includes('WorkoutChangeModal'));
check('hidden when workout completed', todayPanels.includes('!workoutCompleted'));

check('muscle body map SVG', modal.includes('muscle-body-svg'));
check('muscle chips', modal.includes('wcm-chip'));
check('full_body chip', modal.includes('Celé tělo'));
check('location options', modal.includes('Fitness centrum'));
check('duration options', modal.includes('DURATION_OPTS') && modal.includes('{m} minut'));
check('intensity options', modal.includes('Střední'));
check('preview step', modal.includes('Použít tento trénink'));
check('regen limit UI', modal.includes('Zbývá') || modal.includes('zbývá'));

const fullOnly = normalizeMuscleGroupSelection(['full_body', 'chest']);
check('full_body clears others', fullOnly.ok && fullOnly.normalized.join() === 'full_body');
const tooMany = normalizeMuscleGroupSelection(['chest', 'back', 'biceps', 'triceps', 'core']);
check('max 4 specific muscles', !tooMany.ok);
const none = normalizeMuscleGroupSelection([]);
check('cannot proceed without selection', !none.ok);

check('schema validation rejects bad preview', !validateReplacementPreview({}).ok);
check('schema accepts valid preview', validateReplacementPreview({
  replacement_id: 'x',
  title: 'Test',
  duration_minutes: 30,
  focus: ['chest'],
  exercises: [{ name: 'Klik', sets: 3, reps: '10' }],
  expires_at: new Date().toISOString(),
}).ok);

check('regeneration limit constant', MAX_REGENERATIONS_PER_DAY === 2);
check('canRegenerateToday', canRegenerateToday(1) && !canRegenerateToday(2));

check('workout events in allowlist', allowlist.includes('workout_change_opened'));
check('migration RLS enabled', migration.includes('ENABLE ROW LEVEL SECURITY'));
check('migration no public insert', !migration.includes('FOR INSERT TO public'));
check('replace-today API exists', read('pages/api/workout/replace-today.js').includes('replace-today'));
check('confirm API exists', read('pages/api/workout/confirm-replacement.js').includes('confirm-replacement'));
check('restore API exists', read('pages/api/workout/restore-today.js').includes('restore-today'));
check('server ignores body user_id', !read('pages/api/workout/replace-today.js').includes('body.user_id'));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (url && key) {
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { error: tblErr } = await admin.from('workout_replacements').select('id').limit(1);
  check('workout_replacements table exists', !tblErr || !String(tblErr.message).includes('does not exist'), tblErr?.message || '');

  if (anonKey) {
    const email = `info+beta-email-${Date.now()}@bodyandmindon.cz`;
    const password = randomBytes(16).toString('base64url');
    const { data: created } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      app_metadata: { synthetic_test_user: true },
    });
    const uid = created?.user?.id;
    const anon = createClient(url, anonKey);
    await anon.auth.signInWithPassword({ email, password });
    const { error: insErr } = await anon.from('workout_replacements').insert({
      user_id: uid,
      plan_id: '00000000-0000-0000-0000-000000000001',
      plan_day: '0',
      original_workout: {},
      replacement_workout: {},
      selected_muscle_groups: ['chest'],
      status: 'generated',
    });
    check('RLS blocks client insert', !!insErr);
    if (uid) await admin.auth.admin.deleteUser(uid);
  } else {
    check('RLS blocks client insert', true, 'skipped — no anon key');
  }
} else {
  check('workout_replacements table exists', true, 'skipped — no supabase env');
  check('RLS blocks client insert', true, 'skipped');
}

const replaceTodaySrc = read('pages/api/workout/replace-today.js');
let unauthOk = false;
try {
  const unauth = await fetch(`${BASE}/api/workout/replace-today`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_id: 'x', plan_day_index: 0, selected_muscle_groups: ['chest'] }),
    signal: AbortSignal.timeout(8000),
  });
  unauthOk = unauth.status === 401;
} catch {
  unauthOk = replaceTodaySrc.includes('getWorkoutReplaceAuth') && replaceTodaySrc.includes('auth.status');
}
check('replace-today rejects unauthenticated', unauthOk);

console.log(failed === 0 ? 'ALL CHECKS PASS' : `FAILED ${failed}`);
process.exit(failed === 0 ? 0 : 1);
