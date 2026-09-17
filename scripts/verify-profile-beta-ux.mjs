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

// PROMPT_UKLID.md (2026-09-17) — velký úklid tohohle skriptu, ne jen
// smazání _legacy-next řádků:
//
// 1) `lib/habitLabels.js` (HABIT_LABELS/getHabitDisplayLabel) má dnes v celém
//    repu JEDINÉHO konzumenta — tenhle skript (ověřeno greppem). Živá appka
//    štítky návyků bere z `lib/habits.js`'s POSITIVE_HABITS/NEGATIVE_HABITS,
//    které mají JINÝ text (`training` → "Trénink", ne "Pohyb nebo trénink";
//    `healthy_diet` → "Zdravá strava", ne "Vyvážené stravování"). Dvě různé
//    mapování téhož, jedno mrtvé — kontroly přepsány na to živé.
// 2) BetaTodaySection/DailyCheckinPanel/BetaFeedbackButton — celá "beta"
//    sekce dnes v src/ neexistuje (ověřeno greppem), žádný živý ekvivalent.
// 3) WorkoutChangeModal — potvrzeno na dvou místech (`ZmenitDnesniTrenink.tsx`
//    vlastním komentářem i tady), že se tenhle modal NIKDY nepostavil. Živý
//    modal je jednodušší (presety, ne SVG diagram s portálem/scroll-lockem/
//    focus-trapem) a jeho wiring se ověřuje v
//    verify-workout-muscle-selection.mjs a verify-workout-replacement-actions.mjs
//    — tady by šlo jen o duplicitu nebo o kontrolu neexistujících detailů.
const dailyActivation = read('api/daily-activation.js');
const habitsLib = read('lib/habits.js');
const allowlist = read('lib/productEventAllowlist.js');
// `20260713200000_workout_replacements.sql` neexistuje — historie migrací
// byla squashnuta do baseline (stejný nález jako u verify-paid-membership-gate.mjs).
const migration = read('supabase/migrations/20260714180000_baseline_schema.sql');

check('habit label training (živý zdroj lib/habits.js)', /training'[\s\S]{0,60}label:\s*'Trénink'/.test(habitsLib));
check('habit label healthy_diet (živý zdroj lib/habits.js)', /healthy_diet'[\s\S]{0,60}label:\s*'Zdravá strava'/.test(habitsLib));
check('habit label quality_sleep (živý zdroj lib/habits.js)', /quality_sleep'[\s\S]{0,60}label:\s*'Kvalitní spánek'/.test(habitsLib));
check('daily-activation rejects habit writes', dailyActivation.includes("activityType === 'habit'") && dailyActivation.includes('habit_logs'));
check('streaky se u návyků nepočítají (viz naNavyky komentář)', !/streakDays\s*[:=]/.test(read('src/data/adaptery.ts')));

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
check('migration RLS enabled', migration.includes('ALTER TABLE "public"."workout_replacements" ENABLE ROW LEVEL SECURITY'));
check('migration no public insert', !new RegExp('workout_replacements[\\s\\S]{0,300}FOR INSERT TO public').test(migration));
check('replace-today API exists', read('api/workout/replace-today.js').includes('replace-today'));
check('confirm API exists', read('api/workout/confirm-replacement.js').includes('confirm-replacement'));
check('restore API exists', read('api/workout/restore-today.js').includes('restore-today'));
check('restore API no full HTML render', !read('api/workout/restore-today.js').includes('renderPlanHtmlFromStructured'));
check('restore uses fast lib', read('api/workout/restore-today.js').includes('workoutRestoreToday'));
check('server ignores body user_id', !read('api/workout/replace-today.js').includes('body.user_id'));

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

const replaceTodaySrc = read('api/workout/replace-today.js');
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
