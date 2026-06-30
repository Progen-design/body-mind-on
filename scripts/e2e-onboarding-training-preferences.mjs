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
import { chromium, devices } from 'playwright';
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

/** Canonical keys that must not appear as user-facing UI text. */
const INTERNAL_CANONICAL_UI = [
  'bench_press',
  'bent_over_row',
  'romanian_deadlift',
  'overhead_press',
  'bicep_curl',
  'tricep_extension',
  'lateral_raise',
];
const INTERNAL_CANONICAL_RE = new RegExp(`\\b(${INTERNAL_CANONICAL_UI.join('|')})\\b`, 'i');

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
  displayFromMetrics: null,
  screenshots: {},
  visual: {
    mobileViewport: { width: 390, height: 844 },
    environmentBadgeVisible: false,
    equipmentVisible: false,
    workoutNamesUserFriendly: false,
    internalCanonicalKeysVisible: [],
    horizontalScroll: false,
    badgeOverflow: false,
    workoutSectionText: '',
    exerciseListText: '',
    exerciseModalText: '',
  },
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

function shotPath(suffix) {
  return join(ARTIFACTS, `e2e-training-${suffix}-${TIMESTAMP}.png`);
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

function findInternalCanonicalInText(text) {
  if (!text || typeof text !== 'string') return [];
  const found = new Set();
  for (const key of INTERNAL_CANONICAL_UI) {
    if (new RegExp(`\\b${key}\\b`, 'i').test(text)) found.add(key);
  }
  return [...found];
}

function deriveWorkoutDaysForE2E() {
  const todayDow = new Date().getDay();
  return [...new Set([2, 4, 6, todayDow])].sort((a, b) => a - b);
}

async function registerAccount() {
  const workoutDays = deriveWorkoutDaysForE2E();
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
    workout_days: workoutDays,
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

async function elementShot(locator, path) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(250);
  await locator.screenshot({ path });
  return path;
}

async function captureProfileVisuals() {
  mkdirSync(ARTIFACTS, { recursive: true });

  const iPhone = devices['iPhone 14'];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...iPhone,
    viewport: { width: 390, height: 844 },
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
  });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/login?redirect=/profil`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button.login-submit').click();
    await page.waitForURL(/\/profil/, { timeout: 60_000 });
    await page.waitForSelector('#profile-today-heading, #plan-overview', { timeout: 120_000 });

    // 1) Profile top
    const topPath = shotPath('profile-top');
    await page.screenshot({ path: topPath, fullPage: false });
    report.screenshots.profileTop = topPath;

    // 2) Today overview
    const todayHero = page.locator('#profile-today-heading').locator('xpath=ancestor::section[contains(@class,"profile-today-hero")]').first();
    const todayOverviewPath = shotPath('today-overview');
    if (await todayHero.count()) {
      await elementShot(todayHero, todayOverviewPath);
    } else {
      const fallback = page.locator('.profile-today-root').first();
      await elementShot(fallback, todayOverviewPath);
    }
    report.screenshots.todayOverview = todayOverviewPath;

    // 3) Environment badge
    const badgeLocator = page.locator('.profile-today-env-badge, .plan-badge-env').first();
    await badgeLocator.waitFor({ state: 'visible', timeout: 30_000 });
    const badgeText = (await badgeLocator.textContent())?.trim() || '';
    report.profileEnvironmentLabel = badgeText || report.displayFromMetrics || null;
    const equipFromBadge = badgeText.match(/Pomůcky:\s*([^·]+)/)?.[1]?.trim()
      || (badgeText.includes('Jednoručky') && badgeText.includes('Lavice') ? 'Jednoručky, Lavice' : null);
    const equipFromHelper = (report.displayFromMetrics || '').match(/Pomůcky:\s*(.+)$/)?.[1]?.trim() || null;
    report.profileEquipmentLabel = equipFromBadge || equipFromHelper || null;

    report.visual.environmentBadgeVisible = /Doma s vybavením/i.test(badgeText);
    report.visual.equipmentVisible = /Jednoručky/i.test(badgeText) && /Lavice/i.test(badgeText);

    const badgeOverflow = await badgeLocator.evaluate((el) => {
      const card = el.closest('.profile-today-card') || el.parentElement;
      const badgeRect = el.getBoundingClientRect();
      const cardRect = card ? card.getBoundingClientRect() : badgeRect;
      return {
        badgeWiderThanCard: badgeRect.right > cardRect.right + 2 || badgeRect.left < cardRect.left - 2,
        scrollOverflow: el.scrollWidth > el.clientWidth + 1,
      };
    }).catch(() => ({ badgeWiderThanCard: false, scrollOverflow: false }));
    report.visual.badgeOverflow = badgeOverflow.badgeWiderThanCard || badgeOverflow.scrollOverflow;

    const envBadgePath = shotPath('environment-badge');
    await elementShot(badgeLocator, envBadgePath);
    report.screenshots.environmentBadge = envBadgePath;

    // 4) Today workout section
    const workoutSection = page.locator('#profile-today-workout').first();
    await workoutSection.waitFor({ state: 'visible', timeout: 30_000 });
    const workoutPath = shotPath('today-workout');
    await elementShot(workoutSection, workoutPath);
    report.screenshots.todayWorkout = workoutPath;

    const workoutText = await workoutSection.innerText().catch(() => '');
    report.visual.workoutSectionText = workoutText;

    // 5) Exercise list with "Jak cvik provést"
    const exerciseList = workoutSection.locator('.profile-today-workout-list, ul, .profile-today-workout-items').first();
    const exerciseListTarget = (await exerciseList.count()) > 0
      ? exerciseList
      : workoutSection;
    const exerciseListPath = shotPath('exercise-list');
    await elementShot(exerciseListTarget, exerciseListPath);
    report.screenshots.exerciseList = exerciseListPath;

    const exerciseListText = await exerciseListTarget.innerText().catch(() => workoutText);
    report.visual.exerciseListText = exerciseListText;

    const uiTextForNames = `${workoutText}\n${exerciseListText}`;
    report.visual.internalCanonicalKeysVisible = findInternalCanonicalInText(uiTextForNames);
    report.visual.workoutNamesUserFriendly = report.visual.internalCanonicalKeysVisible.length === 0
      && /Jak cvik provést/i.test(exerciseListText);

    // 6) Exercise modal
    const firstExerciseBtn = workoutSection.locator('.profile-today-exercise-btn').first();
    if (await firstExerciseBtn.count()) {
      await firstExerciseBtn.click();
      await page.waitForSelector('.plan-recipe-modal-body', { timeout: 30_000 });
      const modalBody = page.locator('.plan-recipe-modal-body').first();
      const modalText = await modalBody.innerText().catch(() => '');
      report.visual.exerciseModalText = modalText;
      const modalCanonical = findInternalCanonicalInText(modalText);
      report.visual.internalCanonicalKeysVisible = [
        ...new Set([...report.visual.internalCanonicalKeysVisible, ...modalCanonical]),
      ];
      report.visual.workoutNamesUserFriendly = report.visual.internalCanonicalKeysVisible.length === 0;

      const modalPath = shotPath('exercise-modal');
      const modalOverlay = page.locator('.plan-recipe-modal-overlay').first();
      await elementShot(modalOverlay, modalPath);
      report.screenshots.exerciseModal = modalPath;

      await page.locator('.plan-recipe-modal-close').first().click({ force: true }).catch(() => {});
    } else {
      report.screenshots.exerciseModal = null;
      report.visual.workoutNamesUserFriendly = false;
    }

    // Overflow check (page-wide)
    const overflow = await page.evaluate(() => ({
      horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    report.visual.horizontalScroll = overflow.horizontalScroll;
    report.visual.overflowMetrics = overflow;
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
  if (!report.workoutDaysStored) {
    fails.push('workout_days missing');
  } else {
    const days = report.workoutDaysStored.split(',').map((d) => d.trim());
    for (const required of ['2', '4', '6']) {
      if (!days.includes(required)) fails.push(`workout_days missing ${required}`);
    }
    if (!days.includes(String(new Date().getDay()))) {
      fails.push(`workout_days missing today (${new Date().getDay()})`);
    }
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
  if (!report.visual.environmentBadgeVisible) {
    fails.push('profile missing home_equipment badge');
  }
  if (!report.visual.equipmentVisible) {
    fails.push('profile missing equipment labels');
  }
  if (report.visual.internalCanonicalKeysVisible.length) {
    fails.push(`UI shows canonical keys: ${report.visual.internalCanonicalKeysVisible.join(',')}`);
  }
  if (!report.visual.workoutNamesUserFriendly) {
    fails.push('workout names not user-friendly or missing Jak cvik provést');
  }
  if (report.visual.horizontalScroll) {
    fails.push('horizontal scroll on mobile');
  }
  if (report.visual.badgeOverflow) {
    fails.push('environment badge overflows card');
  }
  if (!report.screenshots.profileTop || !report.screenshots.environmentBadge || !report.screenshots.todayWorkout) {
    fails.push('missing required screenshots');
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

  console.log('1/5 Register…', TEST_EMAIL);
  await registerAccount();

  console.log('2/5 Poll body_metrics…');
  const bm = await pollBodyMetrics(supabase);
  report.environmentStored = parseTrainingEnvironment(bm);
  report.equipmentStored = parseAvailableEquipment(bm);
  report.workoutDaysStored = bm.workout_days;
  report.displayFromMetrics = trainingEnvironmentDisplayFromMetrics(bm);

  console.log('3/5 Poll plan + analyze exercises…');
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

  console.log('4/5 Mobile profile visuals + screenshots…');
  await captureProfileVisuals();

  console.log('5/5 Verdict…');
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
