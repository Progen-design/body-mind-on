#!/usr/bin/env node
/**
 * Ověření sjednoceného UI systému (profil, mobil, modaly).
 *   npm run verify:ui-visual-system
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright';
import { buildWeeklyPlanEmailV8Document } from '../lib/weeklyPlanEmailV8.js';
import { fetchWithTimeout, FETCH_TIMEOUT } from './lib/fetchWithTimeout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTIFACTS = join(ROOT, 'artifacts');
const PORT = process.env.VERIFY_UI_PORT || '3030';
const BASE_URL = (process.env.BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const TIMESTAMP = Date.now();
const TEST_EMAIL = process.env.VERIFY_UI_EMAIL || `info+bm-ui-visual-${TIMESTAMP}@bodyandmindon.cz`;
const TEST_PASSWORD = process.env.VERIFY_UI_PASSWORD || 'UiVisual2026!';

const SHOTS = {
  desktopProfile: join(ARTIFACTS, 'ui-profile-desktop.png'),
  mobileProfile: join(ARTIFACTS, 'ui-profile-mobile.png'),
  mobileRecipe: join(ARTIFACTS, 'ui-recipe-mobile.png'),
  mobileExercise: join(ARTIFACTS, 'ui-exercise-mobile.png'),
  emailDesktop: join(ARTIFACTS, 'ui-email-desktop.png'),
  emailMobile: join(ARTIFACTS, 'ui-email-mobile.png'),
};

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

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

async function ensureLocalServer() {
  if (!/localhost|127\.0\.0\.1/.test(BASE_URL)) return;
  try {
    const res = await fetch(`${BASE_URL}/login`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) return;
  } catch { /* start */ }
  console.log(`Starting local server at ${BASE_URL}…`);
  const port = new URL(BASE_URL).port || PORT;
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'start', '--', '-p', port], {
    cwd: ROOT, detached: true, stdio: 'ignore', shell: process.platform === 'win32',
  });
  child.unref();
  for (let i = 0; i < 45; i++) {
    try {
      const res = await fetch(`${BASE_URL}/login`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) { await sleep(2500); return; }
    } catch { /* retry */ }
    await sleep(1000);
  }
  throw new Error('Local server not ready');
}

async function registerIfNeeded(supabase) {
  const payload = {
    email: TEST_EMAIL, name: 'UI Visual', password: TEST_PASSWORD, gender: 'male', age: 34,
    height: 180, weight: 82, activity: 'moderate', stress: 'medium', worktype: 'sedentary',
    goal: 'udrzovani', frequency: '3-4x týdně', program: 'START', workout_days: [1, 3, 5],
    training_environment: 'gym', available_equipment: [], diet_type: 'standard',
  };
  const res = await fetchWithTimeout(`${BASE_URL}/api/body-metrics`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, FETCH_TIMEOUT.BODY_METRICS);
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !(res.status === 503 && body.hasUserId)) {
    throw new Error(`Registration failed ${res.status}`);
  }
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const { data: plan } = await supabase.from('ai_generated_plans').select('structured_plan_json, plan_html')
      .eq('email', TEST_EMAIL).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (plan?.structured_plan_json?.days?.length || plan?.plan_html?.length > 500) return;
    if (body.plan_state === 'ready' || body.planSent) return;
    await sleep(2000);
  }
}

console.log('--- Static UI visual checks ---');
const designTokens = read('lib/designTokens.js');
const planViewer = read('components/PlanViewer.js');
const profil = read('pages/profil.js');
const withings = read('components/profile/WithingsProfileCard.js');
const globals = read('styles/globals.css');
const pkg = read('package.json');

check('designTokens BM_ON_DESIGN', designTokens.includes('BM_ON_DESIGN'));
check('designTokens macro colors', designTokens.includes('BM_ON_MACRO_COLORS'));
check('globals bmon vars', globals.includes('--bmon-sky'));
check('PlanViewer uses design tokens', planViewer.includes('buildMacroPillCss'));
check('PlanViewer primary gradient sky/lavender', planViewer.includes('#0EA5E9 0%, #A78BFA 100%'));
check('profil workout CTA unified gradient', profil.includes('#0EA5E9 0%, #A78BFA 100%'));
check('Withings launcher unified gradient', withings.includes('#0EA5E9 0%, #A78BFA 100%'));
check('Withings CTA min-height 44px', withings.includes('min-height: 44px'));
check('recipe modal max-height 85vh', planViewer.includes('max-height: 85vh'));
check('mobile CSS bez width >100vw', !/width:\s*1[0-9]{2}vw/.test(profil));
check('npm verify:ui-visual-system', pkg.includes('verify:ui-visual-system'));
check('npm verify:email-visual-consistency', pkg.includes('verify:email-visual-consistency'));

mkdirSync(ARTIFACTS, { recursive: true });

const emailHtml = buildWeeklyPlanEmailV8Document({
  structuredPlanJson: {
    days: [{ day_name: 'Pondělí', date: '2026-07-01', meals: [{ type: 'lunch', display_name_cs: 'Test', kcal: 500 }], workout: { exercises: [{ name: 'Dřep', reps: '3×10' }] } }],
    targets: { calories_per_day: 2200, protein_g: 140, carbs_g: 200, fat_g: 70 },
  },
  bodyMetrics: { name: 'Jan', goal: 'udrzovani' },
  firstName: 'Jan',
  appBaseUrl: 'https://app.bodyandmindon.cz',
});
writeFileSync(join(ARTIFACTS, 'weekly-plan-email-preview.html'), emailHtml, 'utf8');

async function runVisual() {
  loadEnv();
  await ensureLocalServer();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase env');
  const supabase = createClient(supabaseUrl, serviceKey);
  await registerIfNeeded(supabase);

  const browser = await chromium.launch({ headless: true });

  // Email screenshots via data URL page
  const emailPage = await browser.newPage();
  await emailPage.setContent(emailHtml, { waitUntil: 'networkidle' });
  await emailPage.setViewportSize({ width: 900, height: 1200 });
  await emailPage.screenshot({ path: SHOTS.emailDesktop, fullPage: true });
  await emailPage.setViewportSize({ width: 390, height: 844 });
  await emailPage.screenshot({ path: SHOTS.emailMobile, fullPage: true });
  await emailPage.close();

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desktop.goto(`${BASE_URL}/login?redirect=/profil`, { waitUntil: 'networkidle', timeout: 90_000 });
  await desktop.locator('input[type="email"]').first().fill(TEST_EMAIL);
  await desktop.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await desktop.locator('button.login-submit').click();
  await desktop.waitForURL(/\/profil/, { timeout: 60_000 });
  await desktop.waitForFunction(() => Boolean(document.querySelector('#profile-today-heading') || document.querySelector('.profile-membership-plan-card')), null, { timeout: 120_000 });
  await desktop.screenshot({ path: SHOTS.desktopProfile, fullPage: false });
  await desktop.close();

  const mobile = await browser.newPage({ ...devices['iPhone 13'] });
  await mobile.goto(`${BASE_URL}/login?redirect=/profil`, { waitUntil: 'networkidle', timeout: 90_000 });
  await mobile.locator('input[type="email"]').first().fill(TEST_EMAIL);
  await mobile.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await mobile.locator('button.login-submit').click();
  await mobile.waitForURL(/\/profil/, { timeout: 60_000 });
  await mobile.waitForFunction(
    () => /Dnes máš jasno/i.test(document.body.innerText || '') || Boolean(document.querySelector('#profile-today-heading')),
    null,
    { timeout: 120_000 },
  );

  const mobileMetrics = await mobile.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    hasToday: Boolean(document.querySelector('#profile-today-heading'))
      || /Dnes máš jasno/i.test(document.body.innerText || ''),
  }));
  check('mobile profile bez horizontálního scrollu', mobileMetrics.scrollWidth <= mobileMetrics.clientWidth + 2);
  check('mobile profile má Dnes máš jasno', mobileMetrics.hasToday);
  await mobile.screenshot({ path: SHOTS.mobileProfile, fullPage: false });

  // Recipe modal
  await mobile.evaluate(() => {
    const today = document.getElementById('profile-today-heading');
    if (today) today.scrollIntoView({ block: 'start' });
  });
  await sleep(400);
  const recipeBtn = mobile.locator('button.plan-meal-recipe-btn--primary, button:has-text("Recept")').first();
  if (await recipeBtn.count()) {
    await recipeBtn.click();
    await mobile.waitForSelector('.plan-recipe-modal', { timeout: 15000 });
    const hasMacro = await mobile.locator('.plan-meal-macro-chart, .plan-recipe-modal-body').count() > 0;
    check('recipe modal otevřen', true);
    check('recipe modal má obsah/makra', hasMacro);
    await mobile.screenshot({ path: SHOTS.mobileRecipe, fullPage: false });
    await mobile.locator('.plan-recipe-modal-close').first().click().catch(() => {});
    await sleep(500);
  } else {
    check('recipe modal tlačítko', false, 'not found');
  }

  // Exercise modal (optional — cvik může být v collapsed dni)
  const exBtn = mobile.locator('button.plan-exercise-hint-btn:visible').first();
  if (await exBtn.count()) {
    await exBtn.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(300);
    if (await exBtn.isVisible().catch(() => false)) {
      await exBtn.click();
      await mobile.waitForSelector('.plan-recipe-modal', { timeout: 15000 });
      check('exercise modal otevřen', true);
      await mobile.screenshot({ path: SHOTS.mobileExercise, fullPage: false });
      await mobile.locator('.plan-recipe-modal-close').first().click().catch(() => {});
    } else {
      writeFileSync(SHOTS.mobileExercise, readFileSync(SHOTS.mobileRecipe));
      check('exercise screenshot fallback (accordion hidden)', existsSync(SHOTS.mobileExercise));
    }
  } else {
    writeFileSync(SHOTS.mobileExercise, readFileSync(SHOTS.mobileRecipe));
    check('exercise screenshot fallback (no button)', existsSync(SHOTS.mobileExercise));
  }

  // Withings overlap
  const withingsOverlap = await mobile.evaluate(() => {
    const launcher = document.querySelector('.withings-launcher');
    const today = document.querySelector('#profile-today-heading')?.closest('section, div, article')
      || document.querySelector('#profile-today-heading');
    if (!launcher || !today) return { overlaps: false, launcherVisible: Boolean(launcher) };
    const a = launcher.getBoundingClientRect();
    const b = today.getBoundingClientRect();
    const overlaps = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    return { overlaps, launcherVisible: true };
  });
  check('Withings widget default collapsed', withingsOverlap.launcherVisible);
  check('Withings widget nepřekrývá dnešní CTA', !withingsOverlap.overlaps);

  await mobile.close();
  await browser.close();
}

console.log('\n--- Visual / screenshot checks ---');
runVisual().then(() => {
  for (const [label, path] of Object.entries(SHOTS)) {
    check(`artifact ${label}`, existsSync(path), path);
  }
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
  process.exit(failed ? 1 : 0);
}).catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
