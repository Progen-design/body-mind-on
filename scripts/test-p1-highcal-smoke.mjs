#!/usr/bin/env node
/**
 * P1 production smoke: vysokokalorická registrace → AI plán (ne reg_deterministic).
 *
 *   TARGET_URL=https://app.bodyandmindon.cz \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/test-p1-highcal-smoke.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { addCalendarDaysIsoPrague, calendarDateIsoInPrague } from '../lib/czechCalendar.js';
import {
  fetchWithTimeout,
  FETCH_TIMEOUT,
  formatFetchError,
} from './lib/fetchWithTimeout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

for (const f of ['.env.production.local', '.env.prod-smoke.local', '.env.local', '.env']) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v.replace(/\r$/, '');
  }
}

const TARGET_URL = (
  process.argv.find((a) => a.startsWith('--url='))?.slice(6) ||
  process.env.TARGET_URL ||
  'https://app.bodyandmindon.cz'
).replace(/\/$/, '');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_MS = 3000;
const TIMEOUT_MS = 120000;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Chybí SUPABASE_URL a/nebo SUPABASE_SERVICE_ROLE_KEY v env.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const ts = Date.now();
const email = `janprikopa+p1smoke-${ts}@gmail.com`;

const payload = {
  email,
  name: 'P1 HighCal Smoke',
  password: 'P1SmokePass1!',
  gender: 'male',
  age: 35,
  height: 188,
  weight: 88,
  activity: 'stredne',
  stress: 'medium',
  worktype: 'sedentary',
  goal: 'nabirani_svaly',
  frequency: '3x tydne',
  program: 'START',
  workout_days: [3, 6],
};

function mealCountsFromStructured(json) {
  const days = json?.days ?? json?.meal_plan?.days ?? [];
  return (Array.isArray(days) ? days : []).map((d, i) => ({
    day: d?.day_name ?? d?.day_index ?? i,
    count: Array.isArray(d?.meals) ? d.meals.length : 0,
  }));
}

async function pollUntilReady(userId, startedAt) {
  while (Date.now() - startedAt < TIMEOUT_MS) {
    const { data: task } = await sb
      .from('ai_tasks')
      .select('id, status, task_type, last_error, result')
      .eq('user_id', userId)
      .eq('task_type', 'initial_plan')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: plan } = await sb
      .from('ai_generated_plans')
      .select('id, generated_by, email_sent, structured_plan_json, daily_calories, created_at, valid_from, valid_until')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const terminalTask = task?.status === 'completed' || task?.status === 'failed';
    if (plan?.id && (terminalTask || plan.generated_by)) {
      return { task, plan };
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  const { data: task } = await sb
    .from('ai_tasks')
    .select('id, status, task_type, last_error, result')
    .eq('user_id', userId)
    .eq('task_type', 'initial_plan')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: plan } = await sb
    .from('ai_generated_plans')
    .select('id, generated_by, email_sent, structured_plan_json, daily_calories, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { task, plan, timedOut: !plan?.id && !task?.status };
}

async function main() {
  console.log('TARGET_URL:', TARGET_URL);
  console.log('SUPABASE:', SUPABASE_URL);
  console.log('TEST EMAIL:', email);
  console.log('');

  const healthUrl = `${TARGET_URL}/api/integrations-status`;
  let health;
  try {
    health = await fetchWithTimeout(healthUrl, { method: 'GET' }, FETCH_TIMEOUT.HEALTH);
  } catch (err) {
    console.error(formatFetchError(err, healthUrl));
    process.exit(1);
  }
  if (!health.ok) {
    console.error('FAIL: integrations-status HTTP', health.status, healthUrl);
    process.exit(1);
  }
  const healthBody = await health.json().catch(() => ({}));
  console.log('App ready:', healthBody.ready, '| supabase ref:', healthBody.supabase_project_ref);
  console.log('');

  const regStarted = Date.now();
  let regBody = {};
  let regStatus = 0;
  const regUrl = `${TARGET_URL}/api/body-metrics`;
  try {
    const res = await fetchWithTimeout(
      regUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      FETCH_TIMEOUT.BODY_METRICS
    );
    regStatus = res.status;
    regBody = await res.json().catch(() => ({}));
  } catch (e) {
    console.error('FAIL: registrace selhala:', formatFetchError(e, regUrl));
    process.exit(1);
  }

  console.log('Registration HTTP:', regStatus);
  console.log('Registration body:', JSON.stringify({
    ok: regBody.ok,
    plan_state: regBody.plan_state,
    planSent: regBody.planSent,
    emailSent: regBody.emailSent,
    initialPlanTaskStatus: regBody.initialPlanTaskStatus,
    generation_source: regBody._diagnostics?.generation_source,
    trainer_task_failed: regBody._diagnostics?.trainer_task_failed,
  }, null, 2));

  const regOk = regStatus >= 200 && regStatus < 300 || (regStatus === 503 && regBody.hasUserId);
  if (!regOk) {
    console.error('FAIL: registrace HTTP', regStatus, regBody.error || regBody.message);
    process.exit(1);
  }

  const { data: metrics } = await sb
    .from('body_metrics')
    .select('user_id, calories_target, goal, weight_kg, height_cm')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (!metrics?.user_id) {
    console.error('FAIL: body_metrics pro email nenalezen');
    process.exit(1);
  }

  const userId = metrics.user_id;
  console.log('user_id:', userId);
  console.log('body_metrics calories_target:', metrics.calories_target);
  console.log('');

  const { task, plan, timedOut } = await pollUntilReady(userId, regStarted);
  if (timedOut && !plan?.id) {
    console.error('FAIL: timeout', TIMEOUT_MS / 1000, 's – task/plan nedokončen');
    process.exit(1);
  }

  const checks = [];
  const fail = (msg) => checks.push({ pass: false, msg });
  const ok = (msg) => checks.push({ pass: true, msg });

  const generatedBy = plan?.generated_by ?? null;
  const diagGenSrc = plan?.structured_plan_json?._diagnostics?.generation_source ?? null;
  if (generatedBy === 'ai-task:initial_plan') ok(`generated_by = ${generatedBy}`);
  else fail(`generated_by = ${JSON.stringify(generatedBy)} (očekáváno ai-task:initial_plan, NE reg_deterministic)`);

  if (diagGenSrc === 'catalog' || diagGenSrc === 'fallback') {
    ok(`generation_source = ${diagGenSrc} (deterministický katalog, ne openai)`);
  } else if (diagGenSrc === 'openai') {
    fail(`generation_source = openai (očekáváno catalog bez sync GPT)`);
  } else if (diagGenSrc) {
    ok(`generation_source = ${diagGenSrc}`);
  } else {
    fail('generation_source v _diagnostics chybí');
  }

  if (plan?.structured_plan_json) ok('structured_plan_json IS NOT NULL');
  else fail('structured_plan_json je NULL');

  const mealCounts = mealCountsFromStructured(plan?.structured_plan_json);
  const dayCount = mealCounts.length;
  const allFour = dayCount >= 7 && mealCounts.every((d) => d.count === 4);
  if (allFour) ok(`každý den má 4 jídla (${dayCount} dnů)`);
  else fail(`jídla/den: ${mealCounts.map((d) => `${d.day}:${d.count}`).join(', ')} (očekáváno 4×7)`);

  if (plan?.email_sent === true) ok('email_sent = true');
  else fail(`email_sent = ${JSON.stringify(plan?.email_sent)}`);

  const taskStatus = task?.status ?? null;
  if (taskStatus === 'completed') ok(`initial_plan status = completed`);
  else {
    const err = task?.last_error || task?.result?.reason || JSON.stringify(task?.result);
    fail(`initial_plan status = ${JSON.stringify(taskStatus)}; last_error: ${err}`);
  }

  const expectedFrom = calendarDateIsoInPrague(new Date());
  const expectedUntil = addCalendarDaysIsoPrague(expectedFrom, 6);
  const planFrom = String(plan?.valid_from || '').split('T')[0];
  const planUntil = String(plan?.valid_until || '').split('T')[0];
  if (planFrom === expectedFrom) ok(`valid_from = ${planFrom} (dnešní Prague)`);
  else fail(`valid_from = ${planFrom} (očekáváno ${expectedFrom})`);
  if (planUntil === expectedUntil) ok(`valid_until = ${planUntil} (+6 dní)`);
  else fail(`valid_until = ${planUntil} (očekáváno ${expectedUntil})`);
  if (dayCount === 7) ok(`structured_plan_json má 7 dní`);
  else fail(`structured_plan_json má ${dayCount} dní (očekáváno 7)`);

  console.log('');
  console.log('=== P1 HIGH-CAL SMOKE RESULT ===');
  console.log('email:', email);
  console.log('user_id:', userId);
  console.log('generated_by:', generatedBy);
  console.log('daily_calories:', plan?.daily_calories ?? null);
  console.log('valid_from:', planFrom, '| valid_until:', planUntil);
  console.log('expected_from:', expectedFrom, '| expected_until:', expectedUntil);
  console.log('structured days:', dayCount);
  console.log('meals per day:', mealCounts.map((d) => d.count).join(', ') || '—');
  console.log('email_sent:', plan?.email_sent ?? null);
  console.log('task status:', taskStatus);
  console.log('task last_error:', task?.last_error ?? task?.result?.reason ?? null);
  console.log('registration generation_source:', regBody._diagnostics?.generation_source ?? null);
  console.log('');

  for (const c of checks) {
    console.log(c.pass ? '  ✓' : '  ✗', c.msg);
  }

  const allPass = checks.every((c) => c.pass);
  console.log('');
  console.log(allPass ? 'PASS' : 'FAIL');
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error('FAIL: neočekávaná chyba:', e);
  process.exit(1);
});
