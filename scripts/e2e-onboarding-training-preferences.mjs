#!/usr/bin/env node
/**
 * E2E: START onboarding training preferences (home_equipment + dumbbells/bench + Út/Čt/So).
 *   npm run e2e:onboarding-training-preferences
 *   BASE_URL=https://app.bodyandmindon.cz npm run e2e:onboarding-training-preferences
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { fetchWithTimeout, FETCH_TIMEOUT } from './lib/fetchWithTimeout.mjs';
import {
  parseTrainingEnvironment,
  parseAvailableEquipment,
  trainingEnvironmentDisplayFromMetrics,
} from '../lib/trainingEnvironment.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTIFACTS = join(ROOT, 'artifacts');
const BASE_URL = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const TIMESTAMP = Date.now();
const TEST_EMAIL = process.env.E2E_ONBOARDING_TRAINING_EMAIL
  || `info+bm-training-e2e-${TIMESTAMP}@bodyandmindon.cz`;
const TEST_PASSWORD = process.env.E2E_PASSWORD || 'TrainingE2e2026!';
const REPORT_PATH = join(ARTIFACTS, `e2e-onboarding-training-${TIMESTAMP}.json`);

const GYM_MACHINE_KEYS = new Set(['leg_press', 'lat_pulldown', 'chest_press', 'hamstring_curl', 'hip_thrust']);
const UNSELECTED_EQUIP_KEYS = new Set(['pull_up']);
const BODYWEIGHT_ONLY_KEYS = new Set([
  'pushup', 'squat', 'plank', 'lunges', 'glute_bridge', 'superman', 'mountain_climber',
  'crunch', 'burpee', 'jumping_jack', 'plank_side', 'russian_twist', 'dead_bug',
]);
const EQUIPMENT_LIFT_KEYS = new Set([
  'bench_press', 'bent_over_row', 'overhead_press', 'romanian_deadlift',
  'bicep_curl', 'tricep_extension', 'lateral_raise', 'goblet_squat',
]);

const report = {
  testEmail: TEST_EMAIL,
  environmentStored: null,
  equipmentStored: [],
  workoutDaysStored: null,
  forbiddenGymMachinesFound: [],
  unselectedEquipmentFound: [],
  pureBodyweightOnlyDespiteEquipment: false,
  profileEnvironmentLabel: null,
  profileEquipmentLabel: null,
  structuredTrainingLabel: null,
  exerciseCanonicalKeys: [],
  verdict: 'FAIL',
  verdictReason: '',
};

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function collectExerciseKeys(structured) {
  const keys = [];
  for (const day of structured?.days || []) {
    for (const ex of day?.workout?.exercises || []) {
      const k = String(ex?.canonical_key || '').trim().toLowerCase();
      if (k) keys.push(k);
    }
  }
  return keys;
}

async function registerAccount() {
  const payload = {
    email: TEST_EMAIL,
    name: 'Training E2E',
    password: TEST_PASSWORD,
    gender: 'male',
    age: 34,
    height: 182,
    weight: 82,
    activity: 'stredne',
    stress: 'medium',
    worktype: 'office_it',
    goal: 'nabirani_svaly',
    frequency: '2-3x týdně',
    program: 'START',
    workout_days: [2, 4, 6],
    training_environment: 'home_equipment',
    available_equipment: ['dumbbells', 'bench'],
    diet_type: 'standard',
    selected_habits: ['training', 'hydration'],
  };

  const res = await fetchWithTimeout(
    `${BASE_URL}/api/body-metrics`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    FETCH_TIMEOUT.BODY_METRICS,
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !(res.status === 503 && body.hasUserId)) {
    throw new Error(`Registration failed HTTP ${res.status}: ${body.error || JSON.stringify(body) || 'empty body'}`);
  }
  return body;
}

async function pollBodyMetrics(supabase) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from('body_metrics')
      .select('id, notes, workout_days, goal, freq_choice')
      .eq('email', TEST_EMAIL)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.notes) return data;
    await sleep(2000);
  }
  throw new Error('body_metrics not found within 90s');
}

async function pollPlan(supabase) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from('ai_generated_plans')
      .select('id, structured_plan_json, user_id')
      .eq('email', TEST_EMAIL)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const days = data?.structured_plan_json?.days;
    if (days?.length >= 7) return data;
    await sleep(3000);
  }
  throw new Error('structured plan not ready within 120s');
}

async function checkProfileBadge() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(`${BASE_URL}/login?redirect=/profil`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button.login-submit').click();
    await page.waitForURL(/\/profil/, { timeout: 60_000 });
    await page.waitForSelector('#profile-today-heading, #plan-overview', { timeout: 120_000 });
    const badgeLocator = page.locator('.profile-today-env-badge, .plan-badge-env').first();
    await badgeLocator.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    const badgeText = (await badgeLocator.textContent().catch(() => ''))?.trim() || '';
    report.profileEnvironmentLabel = badgeText || report.displayFromMetrics || null;
    const equipFromBadge = badgeText.match(/Pomůcky:\s*([^·]+)/)?.[1]?.trim()
      || (badgeText.includes('Jednoručky') && badgeText.includes('Lavice') ? 'Jednoručky, Lavice' : null);
    const equipFromHelper = (report.displayFromMetrics || '').match(/Pomůcky:\s*(.+)$/)?.[1]?.trim() || null;
    report.profileEquipmentLabel = equipFromBadge || equipFromHelper || null;
    mkdirSync(ARTIFACTS, { recursive: true });
    await page.screenshot({ path: join(ARTIFACTS, `e2e-training-profile-${TIMESTAMP}.png`), fullPage: false });
  } finally {
    await browser.close();
  }
}

function computeVerdict() {
  const fails = [];
  if (report.environmentStored !== 'home_equipment') {
    fails.push(`environment=${report.environmentStored}`);
  }
  const equip = report.equipmentStored || [];
  if (!equip.includes('dumbbells') || !equip.includes('bench')) {
    fails.push(`equipment=${equip.join(',')}`);
  }
  if (report.workoutDaysStored !== '2,4,6') {
    fails.push(`workout_days=${report.workoutDaysStored}`);
  }
  if (report.forbiddenGymMachinesFound.length) {
    fails.push(`gym machines: ${report.forbiddenGymMachinesFound.join(',')}`);
  }
  if (report.unselectedEquipmentFound.length) {
    fails.push(`unselected gear: ${report.unselectedEquipmentFound.join(',')}`);
  }
  if (report.pureBodyweightOnlyDespiteEquipment) {
    fails.push('plan is bodyweight-only despite equipment');
  }
  const label = report.profileEnvironmentLabel || '';
  if (!/Doma s vybavením/i.test(label)) {
    fails.push('profile missing home_equipment label');
  }
  const equipLabel = report.profileEquipmentLabel || '';
  if (!/Jednoručky/i.test(equipLabel) || !/Lavice/i.test(equipLabel)) {
    fails.push('profile missing equipment labels');
  }

  report.verdict = fails.length === 0 ? 'READY' : 'FAIL';
  report.verdictReason = fails.length ? fails.join('; ') : 'all checks passed';
}

async function main() {
  loadEnv();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log('1/4 Register…', TEST_EMAIL);
  await registerAccount();

  console.log('2/4 Poll body_metrics…');
  const bm = await pollBodyMetrics(supabase);
  report.environmentStored = parseTrainingEnvironment(bm);
  report.equipmentStored = parseAvailableEquipment(bm);
  report.workoutDaysStored = bm.workout_days;
  report.displayFromMetrics = trainingEnvironmentDisplayFromMetrics(bm);

  console.log('3/4 Poll plan + analyze exercises…');
  const plan = await pollPlan(supabase);
  const structured = plan.structured_plan_json || {};
  report.structuredTrainingLabel = structured.training_environment_label || null;
  report.exerciseCanonicalKeys = collectExerciseKeys(structured);

  report.forbiddenGymMachinesFound = report.exerciseCanonicalKeys.filter((k) => GYM_MACHINE_KEYS.has(k));
  report.unselectedEquipmentFound = report.exerciseCanonicalKeys.filter((k) => UNSELECTED_EQUIP_KEYS.has(k));

  const hasEquipmentLift = report.exerciseCanonicalKeys.some((k) => EQUIPMENT_LIFT_KEYS.has(k));
  const allBodyweight = report.exerciseCanonicalKeys.length > 0
    && report.exerciseCanonicalKeys.every((k) => BODYWEIGHT_ONLY_KEYS.has(k));
  report.pureBodyweightOnlyDespiteEquipment = !hasEquipmentLift && allBodyweight;

  console.log('4/4 Profile badge…');
  await checkProfileBadge();

  computeVerdict();
  mkdirSync(ARTIFACTS, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log('\n=== E2E ONBOARDING TRAINING PREFERENCES ===');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport: ${REPORT_PATH}`);
  console.log(`Verdict: ${report.verdict} — ${report.verdictReason}`);
  process.exit(report.verdict === 'READY' ? 0 : 1);
}

main().catch((err) => {
  console.error('E2E fatal:', err);
  report.verdict = 'FAIL';
  report.verdictReason = err.message;
  try {
    mkdirSync(ARTIFACTS, { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  } catch (_) { /* ignore */ }
  process.exit(1);
});
