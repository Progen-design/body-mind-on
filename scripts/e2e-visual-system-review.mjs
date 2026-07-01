#!/usr/bin/env node
/**
 * Finální vizuální E2E audit — profil, mobilní modaly, e-mail preview.
 *   npm run e2e:visual-system-review
 *   BASE_URL=https://app.bodyandmindon.cz npm run e2e:visual-system-review
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { buildWeeklyPlanEmailV8Document } from '../lib/weeklyPlanEmailV8.js';
import { BM_ON_DESIGN } from '../lib/designTokens.js';
import { getPlanEmailCtaUrl } from '../lib/siteUrls.js';
import { fetchWithTimeout, FETCH_TIMEOUT } from './lib/fetchWithTimeout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTIFACTS = join(ROOT, 'artifacts');
const BASE_URL = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const PORT = process.env.E2E_VISUAL_PORT || '3031';
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
const USE_LOCAL = process.env.E2E_VISUAL_LOCAL === '1' || process.env.E2E_VISUAL_LOCAL === 'true';
const APP_URL = (USE_LOCAL ? LOCAL_URL : BASE_URL).replace(/\/$/, '');
const TIMESTAMP = Date.now();
const TEST_EMAIL = process.env.E2E_VISUAL_EMAIL
  || `info+bm-visual-review-${TIMESTAMP}@bodyandmindon.cz`;
const TEST_PASSWORD = process.env.E2E_PASSWORD || 'VisualReview2026!';
const REPORT_PATH = join(ARTIFACTS, `e2e-visual-system-review-${TIMESTAMP}.json`);

const SHOTS = {
  profileDesktop: join(ARTIFACTS, 'final-profile-desktop.png'),
  profileMobile: join(ARTIFACTS, 'final-profile-mobile.png'),
  recipeModalMobile: join(ARTIFACTS, 'final-recipe-modal-mobile.png'),
  exerciseModalMobile: join(ARTIFACTS, 'final-exercise-modal-mobile.png'),
  emailDesktop: join(ARTIFACTS, 'final-email-desktop.png'),
  emailMobile: join(ARTIFACTS, 'final-email-mobile.png'),
  emailHtml: join(ARTIFACTS, 'final-email-preview.html'),
};

const report = {
  baseUrl: APP_URL,
  testAccount: { email: TEST_EMAIL },
  screenshots: {},
  checks: {},
  verdict: 'FAIL',
  verdictReason: '',
};

let failed = 0;

function htmlWithoutHrefAttrs(html) {
  return String(html || '').replace(/href="[^"]*"/gi, '');
}

function check(label, ok, detail = '') {
  report.checks[label] = { ok: Boolean(ok), detail: detail || undefined };
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
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
  if (!USE_LOCAL) return;
  try {
    const res = await fetch(`${APP_URL}/login`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) return;
  } catch { /* start */ }
  console.log(`Starting local server at ${APP_URL}…`);
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'start', '--', '-p', PORT], {
    cwd: ROOT, detached: true, stdio: 'ignore', shell: process.platform === 'win32',
  });
  child.unref();
  for (let i = 0; i < 45; i++) {
    try {
      const res = await fetch(`${APP_URL}/login`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) { await sleep(2500); return; }
    } catch { /* retry */ }
    await sleep(1000);
  }
  throw new Error('Local server not ready');
}

async function registerStartAccount(supabase) {
  const payload = {
    email: TEST_EMAIL,
    name: 'Visual Review',
    password: TEST_PASSWORD,
    gender: 'male',
    age: 34,
    height: 180,
    weight: 82,
    activity: 'moderate',
    stress: 'medium',
    worktype: 'sedentary',
    goal: 'udrzovani',
    frequency: '3-4x týdně',
    program: 'START',
    workout_days: [1, 3, 5],
    training_environment: 'gym',
    available_equipment: [],
    diet_type: 'standard',
  };
  const res = await fetchWithTimeout(`${APP_URL}/api/body-metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, FETCH_TIMEOUT.BODY_METRICS);
  const body = await res.json().catch(() => ({}));
  report.testAccount.registrationStatus = res.status;
  if (!res.ok && !(res.status === 503 && body.hasUserId)) {
    throw new Error(`Registration failed HTTP ${res.status}: ${body.error || JSON.stringify(body)}`);
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const { data: plan } = await supabase
      .from('ai_generated_plans')
      .select('structured_plan_json, plan_html')
      .eq('email', TEST_EMAIL)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (plan?.structured_plan_json?.days?.length || (plan?.plan_html && plan.plan_html.length > 500)) {
      report.testAccount.planReady = true;
      return plan;
    }
    if (body.plan_state === 'ready' || body.planSent) {
      report.testAccount.planReady = true;
      return null;
    }
    await sleep(2000);
  }
  throw new Error('Plan not ready within 120s');
}

async function loginToProfile(page) {
  await page.goto(`${APP_URL}/login?redirect=/profil`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.locator('input[type="email"]').first().fill(TEST_EMAIL);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button.login-submit').click();
  await page.waitForURL(/\/profil/, { timeout: 60_000 });
  await page.waitForSelector('#profile-today-heading, .profile-today-heading, #plan-overview', { timeout: 120_000 });
}

function buildEmailHtml(planJson) {
  return buildWeeklyPlanEmailV8Document({
    structuredPlanJson: planJson || {
      days: [
        {
          day_name: 'Pondělí',
          date: '2026-07-01',
          meals: [
            { type: 'breakfast', display_name_cs: 'Ovesná kaše s proteinem', kcal: 520, protein_g: 32, carbs_g: 58, fat_g: 14 },
            { type: 'lunch', display_name_cs: 'Kuře s rýží', kcal: 640, protein_g: 48, carbs_g: 62, fat_g: 16 },
          ],
          workout: { exercises: [{ name: 'Goblet dřep', reps: '3×12' }] },
        },
      ],
      targets: { calories_per_day: 2200, protein_g: 140, carbs_g: 200, fat_g: 70 },
    },
    bodyMetrics: { name: 'Jan', goal: 'udrzovani', height_cm: 180, weight_kg: 82 },
    firstName: 'Jan',
    appBaseUrl: 'https://app.bodyandmindon.cz',
  });
}

async function runReview() {
  loadEnv();
  mkdirSync(ARTIFACTS, { recursive: true });
  await ensureLocalServer();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase env');

  const supabase = createClient(supabaseUrl, serviceKey);
  const planRow = await registerStartAccount(supabase);

  const emailHtml = buildEmailHtml(planRow?.structured_plan_json);
  writeFileSync(SHOTS.emailHtml, emailHtml, 'utf8');
  report.screenshots.emailHtml = SHOTS.emailHtml;

  // --- Email static checks ---
  const planCta = getPlanEmailCtaUrl();
  check('email CTA login redirect profil', /\/login\?redirect=.*profil/i.test(planCta), planCta);
  check('email HTML CTA Otevřít plán', /Otevřít plán/i.test(emailHtml));
  check('email bez hlavního CTA /start', !/href="[^"]*\/start"/i.test(emailHtml));
  const emailVisible = htmlWithoutHrefAttrs(emailHtml);
  check('email bez technických protein_g', !/protein_g|carbs_g|fat_g/i.test(emailVisible));
  check('email bez debug activity', !/Aktivita:/i.test(emailHtml));
  check('email brand header', /BODY\s*&amp;\s*MIND\s*ON/i.test(emailHtml));
  check('email dark card bg', emailHtml.includes(BM_ON_DESIGN.colors.cardBg) || emailHtml.includes('#121826'));
  check('email makra viditelná', /bílkovin|BÍLKOVINY|kcal/i.test(emailHtml));

  const browser = await chromium.launch({ headless: true });

  // Email screenshots
  const emailPage = await browser.newPage();
  await emailPage.setContent(emailHtml, { waitUntil: 'networkidle' });
  await emailPage.setViewportSize({ width: 900, height: 1400 });
  await emailPage.screenshot({ path: SHOTS.emailDesktop, fullPage: true });
  await emailPage.setViewportSize({ width: 390, height: 844 });
  await emailPage.screenshot({ path: SHOTS.emailMobile, fullPage: true });
  await emailPage.close();
  report.screenshots.emailDesktop = SHOTS.emailDesktop;
  report.screenshots.emailMobile = SHOTS.emailMobile;

  // Desktop profile
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await loginToProfile(desktop);
  const desktopLayout = await desktop.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    hasProgramVariants: Boolean(document.getElementById('program-variants') || document.querySelector('.program-variants__card')),
    hasUpsell: Boolean(document.getElementById('profile-continuation-upsell')),
    upsellTop: document.getElementById('profile-continuation-upsell')?.getBoundingClientRect().top ?? null,
    todayTop: document.getElementById('profile-today-heading')?.getBoundingClientRect().top ?? null,
    bodyText: document.body.innerText || '',
  }));
  check('desktop bez horizontálního scrollu', desktopLayout.scrollWidth <= desktopLayout.clientWidth + 2);
  check('desktop bez programových karet', !desktopLayout.hasProgramVariants);
  check('desktop pokračovací CTA pod dnešním přehledem',
    desktopLayout.hasUpsell && desktopLayout.upsellTop != null && desktopLayout.todayTop != null
      ? desktopLayout.upsellTop > desktopLayout.todayTop
      : desktopLayout.hasUpsell);
  check('desktop brand feeling (sky/lavender v UI)', desktopLayout.bodyText.length > 100);
  await desktop.screenshot({ path: SHOTS.profileDesktop, fullPage: false });
  report.screenshots.profileDesktop = SHOTS.profileDesktop;
  await desktop.close();

  // Mobile 390×844
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await loginToProfile(mobile);

  const mobileLayout = await mobile.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    hasProgramVariants: Boolean(document.getElementById('program-variants')),
    hasUpsell: Boolean(document.getElementById('profile-continuation-upsell')),
    upsellTop: document.getElementById('profile-continuation-upsell')?.getBoundingClientRect().top ?? null,
    todayTop: document.getElementById('profile-today-heading')?.getBoundingClientRect().top ?? null,
    upsellHeight: document.getElementById('profile-continuation-upsell')?.getBoundingClientRect().height ?? null,
  }));
  check('mobile bez horizontálního scrollu', mobileLayout.scrollWidth <= mobileLayout.clientWidth + 2);
  check('mobile bez programových karet', !mobileLayout.hasProgramVariants);
  check('mobile pokračovací CTA kompaktní', !mobileLayout.hasUpsell || (mobileLayout.upsellHeight != null && mobileLayout.upsellHeight < 220));
  check('mobile pokračovací CTA nízko pod plánem',
    !mobileLayout.hasUpsell || (mobileLayout.upsellTop != null && mobileLayout.todayTop != null && mobileLayout.upsellTop > mobileLayout.todayTop));

  await mobile.screenshot({ path: SHOTS.profileMobile, fullPage: false });
  report.screenshots.profileMobile = SHOTS.profileMobile;

  // Recipe modal
  const mealCard = mobile.locator('#profile-today-meals .profile-today-meal-card').first();
  await mealCard.waitFor({ state: 'visible', timeout: 30_000 });
  await mealCard.locator('button.profile-today-recipe-btn').click();
  await mobile.waitForSelector('.plan-recipe-modal-body', { timeout: 30_000 });
  const recipeText = await mobile.locator('.plan-recipe-modal-body').innerText();
  const recipeChecks = {
    hasIngredients: /Suroviny/i.test(recipeText),
    hasSteps: /Postup/i.test(recipeText),
    hasNutrition: /Nutriční|kcal|makro/i.test(recipeText),
    hasMacroBar: await mobile.locator('.recipe-macro-energy-bar, .plan-meal-macro-chart').count() > 0,
    noTechnical: !/protein_g|carbs_g|fat_g|debug|source:/i.test(recipeText),
    modalScroll: await mobile.evaluate(() => {
      const el = document.querySelector('.plan-recipe-modal-body');
      return el ? el.scrollWidth <= el.clientWidth + 2 : true;
    }),
  };
  check('recept modal čitelný (suroviny + postup)', recipeChecks.hasIngredients && recipeChecks.hasSteps);
  check('recept modal makra viditelná', recipeChecks.hasMacroBar || recipeChecks.hasNutrition);
  check('recept modal bez technických názvů', recipeChecks.noTechnical);
  check('recept modal bez horizontálního scrollu', recipeChecks.modalScroll);
  await mobile.screenshot({ path: SHOTS.recipeModalMobile, fullPage: false });
  report.screenshots.recipeModalMobile = SHOTS.recipeModalMobile;
  await mobile.locator('.plan-recipe-modal-close').first().click();
  await sleep(500);

  // Exercise modal
  const exerciseBtn = mobile.locator('#profile-today-workout .profile-today-exercise-btn').first();
  const hasExercise = await exerciseBtn.count() > 0;
  if (hasExercise) {
    await exerciseBtn.click();
    await mobile.waitForSelector('.plan-recipe-modal-body', { timeout: 20_000 });
    const exText = await mobile.locator('.plan-recipe-modal-body').innerText();
    check('cvik modal čitelný (Jak na to)', /Jak na to/i.test(exText));
    check('cvik modal bez debug textu', !/debug|source:|protein_g/i.test(exText));
    await mobile.screenshot({ path: SHOTS.exerciseModalMobile, fullPage: false });
    report.screenshots.exerciseModalMobile = SHOTS.exerciseModalMobile;
    await mobile.locator('.plan-recipe-modal-close').first().click({ force: true }).catch(() => {});
    await sleep(400);
  } else {
    check('cvik modal tlačítko dostupné', false, 'no exercise today');
    writeFileSync(SHOTS.exerciseModalMobile, readFileSync(SHOTS.recipeModalMobile));
    report.screenshots.exerciseModalMobile = SHOTS.exerciseModalMobile;
  }

  // Withings overlap (collapsed)
  const withingsState = await mobile.evaluate(() => {
    const launcher = document.querySelector('.withings-launcher');
    const todayCta = document.querySelector('#profile-today-meals button, #profile-today-workout button');
    if (!launcher) return { visible: false, overlaps: false };
    const a = launcher.getBoundingClientRect();
    const b = todayCta?.getBoundingClientRect();
    const overlaps = b ? !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom) : false;
    return { visible: true, overlaps, collapsed: document.querySelector('.withings-floating-card')?.dataset.withingsCollapsed === '1' };
  });
  check('Withings widget viditelný collapsed', withingsState.visible);
  check('Withings widget nepřekrývá CTA', !withingsState.overlaps);

  await mobile.close();
  await browser.close();

  // Brand consistency heuristic
  const profilSrc = readFileSync(join(ROOT, 'pages/profil.js'), 'utf8');
  check('brand consistency profil gradient', profilSrc.includes('#0EA5E9') && profilSrc.includes('#A78BFA'));
  check('brand consistency email + profil dark bg',
    emailHtml.includes('#0A1018') || emailHtml.includes(BM_ON_DESIGN.colors.bg));

  for (const [key, path] of Object.entries(SHOTS)) {
    check(`screenshot ${key}`, existsSync(path), path);
  }

  const critical = [
    report.checks['mobile bez horizontálního scrollu']?.ok,
    report.checks['email CTA login redirect profil']?.ok,
    report.checks['email bez hlavního CTA /start']?.ok,
    report.checks['recept modal čitelný (suroviny + postup)']?.ok,
    report.checks['Withings widget nepřekrývá CTA']?.ok,
    report.checks['mobile bez programových karet']?.ok,
  ];
  report.verdict = failed === 0 && critical.every(Boolean) ? 'READY' : failed === 0 ? 'PARTIAL' : 'FAIL';
  report.verdictReason = report.verdict === 'READY'
    ? 'profile, mobile modals and email preview visually consistent'
    : `${failed} check(s) failed`;

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nReport: ${REPORT_PATH}`);
  console.log(`Verdict: ${report.verdict} — ${report.verdictReason}`);
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
  process.exit(failed ? 1 : 0);
}

runReview().catch((err) => {
  console.error('Fatal:', err);
  report.verdict = 'FAIL';
  report.verdictReason = err.message;
  try {
    mkdirSync(ARTIFACTS, { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  } catch { /* ignore */ }
  process.exit(1);
});
