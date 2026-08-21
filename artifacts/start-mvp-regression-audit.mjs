#!/usr/bin/env node
/** Temporary START MVP regression audit — not committed (artifacts/). */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { fetchWithTimeout, FETCH_TIMEOUT } from '../scripts/lib/fetchWithTimeout.mjs';
import { TRAINING_ENVIRONMENT_LABELS } from '../lib/trainingEnvironment.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const TS = Date.now();
const PASSWORD = process.env.E2E_PASSWORD || 'StartMvpAudit2026!';

const GYM_MACHINES = new Set(['leg_press', 'lat_pulldown', 'chest_press', 'hamstring_curl', 'hip_thrust']);
const GYM_FORBIDDEN_BW = new Set(['pushup', 'squat', 'lunges', 'glute_bridge', 'mountain_climber', 'plank_side', 'russian_twist', 'burpee', 'jumping_jack']);
const HOME_BW_FORBIDDEN = new Set(['bench_press', 'leg_press', 'lat_pulldown', 'chest_press', 'hamstring_curl', 'hip_thrust']);
const HOME_EQUIP_FORBIDDEN = new Set(['leg_press', 'lat_pulldown', 'chest_press', 'hamstring_curl', 'pull_up']);
const EQUIP_LIFTS = new Set(['bench_press', 'bent_over_row', 'overhead_press', 'romanian_deadlift', 'bicep_curl', 'tricep_extension', 'lateral_raise', 'goblet_squat']);
const UNSELECTED_EQUIP = new Set(['bands', 'pull_up', 'kettlebell', 'trx']);

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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function collectKeys(structured) {
  const keys = [];
  for (const day of structured?.days || []) {
    for (const ex of day?.workout?.exercises || day?.exercises || []) {
      const k = String(ex?.canonical_key || '').trim().toLowerCase();
      if (k) keys.push(k);
    }
  }
  return keys;
}

const SCENARIOS = [
  {
    id: 'gym',
    email: `info+bm-mvp-gym-${TS}@bodyandmindon.cz`,
    payload: {
      name: 'MVP Gym', gender: 'male', age: 36, height: 185, weight: 90,
      activity: 'moderate', stress: 'medium', worktype: 'sedentary', goal: 'udrzovani',
      frequency: '4-5x týdně', program: 'START', workout_days: [1, 2, 4, 5],
      training_environment: 'gym', available_equipment: [], diet_type: 'standard',
    },
    expectLabel: 'Posilovna',
    validate(keys) {
      const issues = [];
      const bwOnly = keys.length > 0 && keys.every((k) => !GYM_MACHINES.has(k) && !['bench_press', 'bent_over_row', 'goblet_squat'].includes(k));
      const forbidden = keys.filter((k) => GYM_FORBIDDEN_BW.has(k));
      const hasGym = keys.some((k) => GYM_MACHINES.has(k) || ['bench_press', 'goblet_squat', 'chest_press'].includes(k));
      if (forbidden.length) issues.push(`forbidden bodyweight: ${forbidden.join(',')}`);
      if (bwOnly) issues.push('pure bodyweight-only plan');
      if (!hasGym) issues.push('missing gym-first exercises');
      return { ok: issues.length === 0, issues, hasGym, forbidden };
    },
  },
  {
    id: 'home_bodyweight',
    email: `info+bm-mvp-hbw-${TS}@bodyandmindon.cz`,
    payload: {
      name: 'MVP Home BW', gender: 'female', age: 32, height: 168, weight: 62,
      activity: 'stredne', stress: 'low', worktype: 'office_it', goal: 'redukce',
      frequency: '3x týdně', program: 'START', workout_days: [1, 3, 5],
      training_environment: 'home_bodyweight', available_equipment: [], diet_type: 'standard',
    },
    expectLabel: 'Doma bez vybavení',
    validate(keys) {
      const issues = [];
      const machines = keys.filter((k) => HOME_BW_FORBIDDEN.has(k));
      const equip = keys.filter((k) => ['dumbbells', 'bands', 'trx', 'kettlebell'].includes(k));
      if (machines.length) issues.push(`gym machines: ${machines.join(',')}`);
      if (equip.length) issues.push(`equipment lifts: ${equip.join(',')}`);
      return { ok: issues.length === 0, issues, machines };
    },
  },
  {
    id: 'home_equipment',
    email: `info+bm-mvp-heq-${TS}@bodyandmindon.cz`,
    payload: {
      name: 'MVP Home Equip', gender: 'male', age: 34, height: 182, weight: 82,
      activity: 'stredne', stress: 'medium', worktype: 'office_it', goal: 'nabirani_svaly',
      frequency: '2-3x týdně', program: 'START', workout_days: [2, 4, 6],
      training_environment: 'home_equipment', available_equipment: ['dumbbells', 'bench'],
      diet_type: 'standard',
    },
    expectLabel: 'Doma s vybavením',
    expectEquip: 'Jednoručky, Lavice',
    validate(keys) {
      const issues = [];
      const machines = keys.filter((k) => HOME_EQUIP_FORBIDDEN.has(k));
      const unselected = keys.filter((k) => UNSELECTED_EQUIP.has(k));
      const hasEquip = keys.some((k) => EQUIP_LIFTS.has(k));
      if (machines.length) issues.push(`gym machines: ${machines.join(',')}`);
      if (unselected.length) issues.push(`unselected equipment: ${unselected.join(',')}`);
      if (!hasEquip) issues.push('missing dumbbell/bench exercises');
      return { ok: issues.length === 0, issues, hasEquip, machines };
    },
  },
];

async function register(scenario) {
  const payload = { ...scenario.payload, email: scenario.email, password: PASSWORD };
  const res = await fetchWithTimeout(
    `${BASE_URL}/api/body-metrics`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    FETCH_TIMEOUT.BODY_METRICS,
  );
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, ok: res.ok || (res.status === 503 && body.hasUserId) };
}

async function pollPlan(supabase, email) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from('ai_generated_plans')
      .select('id, structured_plan_json, email_sent, user_id, plan_html')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.structured_plan_json?.days?.length >= 7) return data;
    if (data?.plan_html && String(data.plan_html).length > 500 && data?.structured_plan_json?.days?.length) return data;
    await sleep(3000);
  }
  return null;
}

async function countEmails(supabase, email) {
  const { count } = await supabase
    .from('ai_generated_plans')
    .select('id', { count: 'exact', head: true })
    .eq('email', email);
  return count ?? 0;
}

async function pollBodyMetrics(supabase, email) {
  const { data } = await supabase
    .from('body_metrics')
    .select('id, notes, workout_days, training_environment')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

loadEnv();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const report = { timestamp: TS, baseUrl: BASE_URL, accounts: {} };

for (const scenario of SCENARIOS) {
  console.log(`\n--- Register ${scenario.id} ---`);
  const reg = await register(scenario);
  const plan = await pollPlan(supabase, scenario.email);
  const bm = await pollBodyMetrics(supabase, scenario.email);
  const emailCount = await countEmails(supabase, scenario.email);
  const structured = plan?.structured_plan_json || {};
  const keys = collectKeys(structured);
  const validation = scenario.validate(keys);
  const label = structured.training_environment_label || TRAINING_ENVIRONMENT_LABELS[scenario.payload.training_environment];

  report.accounts[scenario.id] = {
    email: scenario.email,
    password: PASSWORD,
    registrationStatus: reg.status,
    planGenerated: Boolean(plan?.id),
    planId: plan?.id || null,
    emailSent: Boolean(plan?.email_sent),
    emailCount,
    trainingLabel: label,
    exerciseKeys: keys,
    bodyMetricsSaved: Boolean(bm?.id),
    workoutDays: bm?.workout_days || scenario.payload.workout_days,
    strictness: validation,
    labelMatch: label?.includes(scenario.expectLabel),
  };
  console.log(JSON.stringify(report.accounts[scenario.id], null, 2));
}

const outPath = join(ROOT, 'artifacts', `start-mvp-regression-audit-${TS}.json`);
mkdirSync(join(ROOT, 'artifacts'), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\nReport: ${outPath}`);
