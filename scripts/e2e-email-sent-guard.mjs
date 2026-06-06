#!/usr/bin/env node
/**
 * E2E: registrace → sendPlanEmail → ai_generated_plans.email_sent=true → druhý průchod neposílá.
 *
 *   node scripts/e2e-email-sent-guard.mjs              # jen druhý průchod (bez nové registrace = bez mailu)
 *   node scripts/e2e-email-sent-guard.mjs --full       # plná registrace (1× mail na janprikopa@gmail.com)
 *
 * Vyžaduje: běžící dev server, SUPABASE_* + CRON_SECRET v .env.local
 * POZOR: --full pošle reálný plán na e-mail. Neopakovat bez smazání účtu.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const FULL_REGISTRATION = process.argv.includes('--full');
/** @see .cursor/rules/10-user-preferences.mdc */
const DEFAULT_TEST_EMAIL = 'janprikopa@gmail.com';
const TEST_EMAIL = (process.env.E2E_EMAIL || DEFAULT_TEST_EMAIL).trim().toLowerCase();

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (existsSync(p)) {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && process.env[m[1].trim()] === undefined) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
    break;
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET || process.env.AI_SCHEDULER_SECRET;

if (!supabaseUrl || !serviceKey) {
  console.error('Chybí SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function register() {
  const payload = {
    email: TEST_EMAIL,
    name: 'EmailSent Guard E2E',
    password: 'CatalogTest2026!',
    gender: 'male',
    age: 32,
    height: 180,
    weight: 85,
    activity: 'moderate',
    stress: 'medium',
    worktype: 'sedentary',
    goal: 'udrzovani',
    frequency: '3x tydne',
    program: 'START',
    workout_days: [1, 3, 5],
    diet_type: 'standard',
  };

  console.log('1) POST /api/body-metrics →', TEST_EMAIL);
  const res = await fetch(`${BASE_URL}/api/body-metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Registrace ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  console.log('   planSent:', json.planSent, 'plan_state:', json.plan_state);
  return json;
}

async function loadArtifacts() {
  const { data: bm } = await supabase
    .from('body_metrics')
    .select('user_id, email')
    .eq('email', TEST_EMAIL)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: plan } = await supabase
    .from('ai_generated_plans')
    .select('id, email_sent, valid_from, valid_until, is_active')
    .eq('user_id', bm?.user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: task } = await supabase
    .from('ai_tasks')
    .select('id, status, result')
    .eq('user_id', bm?.user_id)
    .eq('task_type', 'initial_plan')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { bm, plan, task };
}

async function pollEmailSent(maxMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { plan, task } = await loadArtifacts();
    if (plan?.email_sent === true) {
      return loadArtifacts();
    }
    if (task?.status === 'completed' && task?.result?.email_sent === true && plan?.id) {
      // Task hlásí odeslání, DB flag může být o chvíli později
      await new Promise((r) => setTimeout(r, 500));
      const again = await loadArtifacts();
      if (again.plan?.email_sent === true) return again;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return loadArtifacts();
}

async function runSecondPass(userId) {
  if (!cronSecret) {
    console.warn('   CRON_SECRET chybí – druhý průchod přeskočen');
    return null;
  }

  const idempotencyKey = `e2e-dup-guard:${userId}:${Date.now()}`;
  const { data: inserted, error: insertErr } = await supabase
    .from('ai_tasks')
    .insert({
      user_id: userId,
      agent_slug: 'trainer',
      task_type: 'initial_plan',
      idempotency_key: idempotencyKey,
      payload: { prompt: 'E2E duplicate guard – neměl by poslat e-mail znovu' },
      status: 'pending',
    })
    .select('id')
    .maybeSingle();

  if (insertErr) throw new Error(`Insert duplicate task: ${insertErr.message}`);
  console.log('3) Vložen druhý pending initial_plan task', inserted.id);

  const schedRes = await fetch(`${BASE_URL}/api/ai/run-scheduler`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cronSecret}` },
    signal: AbortSignal.timeout(180000),
  });
  const schedJson = await schedRes.json().catch(() => ({}));
  if (!schedRes.ok) {
    throw new Error(`Scheduler ${schedRes.status}: ${JSON.stringify(schedJson).slice(0, 200)}`);
  }

  const { data: task2 } = await supabase
    .from('ai_tasks')
    .select('id, status, result')
    .eq('id', inserted.id)
    .maybeSingle();

  return task2;
}

async function main() {
  const health = await fetch(`${BASE_URL}/api/integrations-status`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!health.ok) throw new Error(`API health ${health.status}`);

  let { plan, task, bm } = await loadArtifacts();

  if (FULL_REGISTRATION) {
    await register();
    console.log('2) Čekám na ai_generated_plans.email_sent=true …');
    ({ plan, task, bm } = await pollEmailSent());
  } else {
    console.log('1) Režim --guard-only: registrace přeskočena (žádný nový mail)');
    if (!plan?.id || plan.email_sent !== true) {
      console.error('FAIL: pro guard-only potřebuješ existující plán s email_sent=true. Spusť jednou --full.');
      process.exit(1);
    }
    console.log('   OK existující plán', { plan_id: plan.id, email_sent: plan.email_sent });
  }

  if (!plan?.id) {
    console.error('FAIL: plán nebyl vytvořen');
    process.exit(1);
  }
  if (plan.email_sent !== true) {
    console.error('FAIL: email_sent není true v DB', {
      plan_id: plan.id,
      email_sent: plan.email_sent,
      task_email_sent: task?.result?.email_sent,
      task_status: task?.status,
    });
    process.exit(1);
  }
  if (FULL_REGISTRATION) {
    console.log('   OK email_sent=true', { plan_id: plan.id, task_id: task?.id });
  }

  console.log(`${FULL_REGISTRATION ? '3' : '2'}) Druhý průchod (duplicate initial_plan task) …`);
  const task2 = await runSecondPass(bm.user_id);
  if (task2) {
    const skipped =
      task2.result?.skipped === true ||
      task2.result?.skip_reason?.startsWith('skipped_');
    const resultEmailSent = task2.result?.email_sent === true;
    console.log('   task2 status:', task2.status, 'skipped:', skipped, 'result.email_sent:', resultEmailSent);

    if (task2.status !== 'completed') {
      console.error('FAIL: druhý task nebyl completed', task2);
      process.exit(1);
    }
    if (!resultEmailSent) {
      console.error('FAIL: druhý průchod nevrátil email_sent=true (hrozí duplicitní mail / last-resort)');
      process.exit(1);
    }
  }

  const { plan: planAfter } = await loadArtifacts();
  if (planAfter?.email_sent !== true) {
    console.error('FAIL: email_sent v DB po druhém průchodu', planAfter);
    process.exit(1);
  }

  console.log('');
  console.log('PASS: registrace → email_sent=true → druhý průchod neposílá (skip + email_sent=true)');
  console.log('Test email:', TEST_EMAIL);
}

main().catch((e) => {
  console.error('E2E selhalo:', e.message);
  process.exit(1);
});
