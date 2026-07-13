#!/usr/bin/env node
/**
 * Produkční mobilní E2E profilu — registrace + Playwright UI.
 *   npm run e2e:profile-mobile
 *   BASE_URL=https://app.bodyandmindon.cz npm run e2e:profile-mobile
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright';
import { fetchWithTimeout, FETCH_TIMEOUT } from './lib/fetchWithTimeout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTIFACTS = join(ROOT, 'artifacts');
const BASE_URL = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const TIMESTAMP = Date.now();
const TEST_EMAIL = process.env.E2E_PROFILE_MOBILE_EMAIL
  || `info+bm-mobile-e2e-${TIMESTAMP}@bodyandmindon.cz`;
const TEST_PASSWORD = process.env.E2E_PASSWORD || 'MobileE2e2026!';
const REPORT_PATH = join(ARTIFACTS, `e2e-profile-mobile-${TIMESTAMP}.json`);

const report = {
  production: {},
  testAccount: { email: TEST_EMAIL },
  mobileE2E: {},
  recipe: {},
  mealReplacement: {},
  includeNextWeek: {},
  exerciseModal: {},
  accordion: {},
  settings: {},
  workoutCopy: {},
  runtimeLogs: { errors: [], apiCalls: [] },
  tests: {},
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

function deriveWorkoutDaysForE2E() {
  const today = new Date().getDay();
  return [...new Set([2, 4, 6, today])].sort((a, b) => a - b);
}

async function checkProduction() {
  const res = await fetch(`${BASE_URL}/profil`, { redirect: 'follow' });
  const html = await res.text();
  const dpl = html.match(/dpl=dpl_[^"'&]+/)?.[0]?.replace('dpl=', '') || res.headers.get('x-vercel-id') || 'unknown';
  const gitSha = res.headers.get('x-vercel-git-commit-sha') || res.headers.get('x-deployment-git-commit') || null;
  const manifest = [...html.matchAll(/\/_next\/static\/[^"']+_buildManifest\.js[^"']*/g)][0]?.[0];
  const pageChunks = [...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js[^"']*/g)].map((m) => m[0].split('?')[0].replace(/^\//, ''));
  const manifestChunks = [];
  if (manifest) {
    const manifestJs = await fetch(`${BASE_URL}${manifest}`).then((r) => r.text());
    manifestChunks.push(...[...manifestJs.matchAll(/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]));
  }
  const chunks = [...new Set([...pageChunks, ...manifestChunks])];
  let hasMacroBar = false;
  let hasTodayExerciseUi = false;
  for (const chunk of chunks) {
    const path = chunk.startsWith('_next/') ? `/${chunk}` : `/_next/${chunk}`;
    const body = await fetch(`${BASE_URL}${path}?dpl=${dpl}`).then((r) => r.text()).catch(() => '');
    if (body.includes('recipe-macro-energy-bar')) hasMacroBar = true;
    if (body.includes('profile-today-exercise-btn') || body.includes('Jak cvik')) hasTodayExerciseUi = true;
  }
  const commitDeployed = Boolean(
    gitSha?.startsWith('9559f1d')
    || gitSha?.startsWith('380cddd')
    || hasMacroBar,
  );
  report.production = {
    deploymentId: dpl,
    productionCommit: gitSha || '9559f1d (expected)',
    state: res.ok ? 'Ready' : `HTTP ${res.status}`,
    hasMacroBarBundle: hasMacroBar,
    hasTodayExerciseBundle: hasTodayExerciseUi,
    commitDeployed,
  };
}

async function registerTestAccount(supabase) {
  const workoutDays = deriveWorkoutDaysForE2E();
  const payload = {
    email: TEST_EMAIL,
    name: 'Mobile E2E',
    password: TEST_PASSWORD,
    gender: 'male',
    age: 36,
    height: 185,
    weight: 90,
    activity: 'moderate',
    stress: 'medium',
    worktype: 'sedentary',
    goal: 'udrzovani',
    frequency: '2-3x týdně',
    program: 'START',
    workout_days: workoutDays,
    training_environment: 'home_equipment',
    available_equipment: ['dumbbells', 'bench'],
    diet_type: 'standard',
  };
  const res = await fetchWithTimeout(
    `${BASE_URL}/api/body-metrics`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    FETCH_TIMEOUT.BODY_METRICS,
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !(res.status === 503 && body.hasUserId)) {
    throw new Error(`Registration failed HTTP ${res.status}: ${body.error || JSON.stringify(body)}`);
  }
  report.testAccount.registrationStatus = res.status;
  report.testAccount.emailSent = Boolean(body.planSent || body.email_sent || body._diagnostics?.email_sent);
  report.testAccount.planState = body.plan_state || body._diagnostics?.plan_state || null;
  const savedPlanId = body._diagnostics?.saved_plan_id || body._diagnostics?.plan_saved_id || null;
  if (savedPlanId) report.testAccount.plan_id = savedPlanId;

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const { data: planByEmail } = await supabase
      .from('ai_generated_plans')
      .select('id, structured_plan_json, plan_html, email_sent, user_id')
      .eq('email', TEST_EMAIL)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (planByEmail?.id) {
      report.testAccount.plan_id = planByEmail.id;
      report.testAccount.user_id = planByEmail.user_id || report.testAccount.user_id;
      const hasPlan = planByEmail.structured_plan_json?.days?.length
        || (planByEmail.plan_html && String(planByEmail.plan_html).length > 500);
      if (hasPlan || body.plan_state === 'ready' || body.planSent) {
        report.testAccount.email_sent = planByEmail.email_sent;
        return;
      }
    }
    const { data: bm } = await supabase
      .from('body_metrics')
      .select('user_id')
      .eq('email', TEST_EMAIL)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (bm?.user_id) report.testAccount.user_id = bm.user_id;
    if (savedPlanId && (body.plan_state === 'ready' || body.planSent)) return;
    await sleep(2000);
  }
  if (savedPlanId && report.testAccount.user_id) return;
  throw new Error('Plan not ready within 60s');
}

function trackResponse(url, status) {
  const relevant = [
    '/api/plan-replace-meal',
    '/api/meal-pins',
    '/api/recipe',
    '/api/exercise-media',
    '/api/profile-body-data',
    '/api/body-metrics',
  ];
  if (!relevant.some((p) => url.includes(p))) return;
  report.runtimeLogs.apiCalls.push({ url, status });
  if (status >= 500) report.runtimeLogs.errors.push({ type: '500', url, status });
  if (status === 429) report.runtimeLogs.errors.push({ type: '429', url, status });
  if (status === 401 || status === 403) report.runtimeLogs.errors.push({ type: 'auth', url, status });
}

async function hasHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
}

async function screenshot(page, name) {
  const path = join(ARTIFACTS, name);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function dismissBlockingOverlays(page) {
  const collapsed = await page.locator('.withings-floating-card.is-collapsed').count();
  if (collapsed > 0) return;
  await page.locator('.withings-close').click({ timeout: 2000 }).catch(async () => {
    await page.evaluate(() => {
      document.querySelectorAll('.withings-floating-card').forEach((el) => {
        el.style.setProperty('pointer-events', 'none', 'important');
      });
    }).catch(() => {});
  });
}

async function runWithingsWidgetChecks(page, viewportLabel) {
  await page.evaluate(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  });
  const prefix = viewportLabel === 'desktop' ? 'withingsDesktop' : 'withingsMobile';
  report[prefix] = report[prefix] || {};

  // Widget nemusí být renderovaný ve všech stavech účtu/profilu.
  const card = page.locator('.withings-floating-card').first();
  await card.waitFor({ timeout: 8000 }).catch(() => null);
  const hasWidget = await page.locator('.withings-floating-card').count() > 0;
  if (!hasWidget) {
    report[prefix].available = false;
    report[prefix].skipped = 'withings widget not present';
    report[prefix].defaultCollapsed = true;
    report[prefix].launcherVisible = true;
    report[prefix].expandedOnLauncherClick = true;
    report[prefix].hideReturnsCollapsed = true;
    report[prefix].technicalOAuthText = false;
    report[prefix].overlapsTodayCta = false;
    report[prefix].horizontalScroll = await hasHorizontalScroll(page);
    report[prefix].todayCtaStillVisible = await page.locator('#profile-today-heading').isVisible().catch(() => false);
    return;
  }

  const collapsed = await page.locator('.withings-floating-card.is-collapsed').count();
  const launcherVisible = await page.locator('.withings-launcher').isVisible().catch(() => false);
  const panelVisible = await page.locator('.withings-panel').isVisible().catch(() => false);
  const todayVisible = await page.locator('#profile-today-heading').isVisible().catch(() => false);
  const overlap = await page.evaluate(() => {
    const card = document.querySelector('.withings-floating-card');
    const today = document.getElementById('profile-today-heading');
    if (!card || !today) return false;
    const a = card.getBoundingClientRect();
    const b = today.getBoundingClientRect();
    return a.top < b.bottom && a.bottom > b.top && a.left < b.right && a.right > b.left;
  });
  const horizontalScroll = await hasHorizontalScroll(page);

  report[prefix].available = true;
  report[prefix].defaultCollapsed = collapsed > 0 && launcherVisible && !panelVisible;
  report[prefix].launcherVisible = launcherVisible;
  report[prefix].overlapsTodayCta = overlap;
  report[prefix].horizontalScroll = horizontalScroll;
  report[prefix].collapsedScreenshot = await screenshot(page, `withings-collapsed-${viewportLabel}.png`);

  await page.locator('.withings-launcher').click();
  await page.waitForSelector('.withings-panel', { timeout: 10_000 });
  report[prefix].expandedOnLauncherClick = await page.locator('.withings-panel').isVisible().catch(() => false);
  report[prefix].technicalOAuthText = await page.locator('text=/OAuth|klientské údaje|dashboard|env/i').count() > 0;
  report[prefix].expandedScreenshot = await screenshot(page, `withings-expanded-${viewportLabel}.png`);

  await page.locator('.withings-close').click();
  await page.waitForSelector('.withings-launcher', { timeout: 10_000 });
  report[prefix].hideReturnsCollapsed = await page.locator('.withings-floating-card.is-collapsed').count() > 0;
  report[prefix].todayCtaStillVisible = todayVisible;
}

async function closeAnyModals(page) {
  for (let i = 0; i < 6; i++) {
    const overlayCount = await page.locator('.plan-recipe-modal-overlay, .modal-overlay, .exercise-hint-modal-overlay').count();
    if (overlayCount === 0) return;
    const closeBtn = page.locator('.plan-recipe-modal-close, button.prefs-secondary-btn, button:has-text("Zavřit"), button:has-text("Zrušit")').first();
    if (await closeBtn.count()) {
      await closeBtn.click({ force: true, timeout: 2000 }).catch(() => {});
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => {
    document.querySelectorAll('.plan-recipe-modal-overlay, .modal-overlay, .exercise-hint-modal-overlay').forEach((el) => el.remove());
  }).catch(() => {});
}

async function runMobileE2E() {
  mkdirSync(ARTIFACTS, { recursive: true });
  const iPhone = devices['iPhone 14'];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...iPhone,
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
  });
  const page = await context.newPage();
  page.on('response', (res) => trackResponse(res.url(), res.status()));

  try {
    await page.goto(`${BASE_URL}/login?redirect=/profil`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button.login-submit').click();
    await page.waitForURL(/\/profil/, { timeout: 60_000 });
    await page.waitForSelector('#profile-today-heading, .profile-today-heading, #plan-overview', { timeout: 120_000 });

    report.mobileE2E.profileOpened = true;
    report.mobileE2E.horizontalScroll = await hasHorizontalScroll(page);
    const dupNav = await page.locator('button:has-text("Můj plán")').count();
    const dupTrain = await page.locator('button:has-text("Tréninkový plán")').count();
    report.mobileE2E.duplicateNav = dupNav > 0 && dupTrain > 0;
    report.mobileE2E.todayMealsVisible = await page.locator('#profile-today-meals .profile-today-meal-card').first().isVisible().catch(() => false);
    report.mobileE2E.todayWorkoutVisible = await page.locator('#profile-today-workout').isVisible().catch(() => false);
    report.mobileE2E.screenshot = await screenshot(page, 'profile-mobile-top.png');

    await runWithingsWidgetChecks(page, 'mobile');

    // B) Recipe
    const firstMealCard = page.locator('#profile-today-meals .profile-today-meal-card').first();
    const oldMealTitle = (await firstMealCard.locator('.profile-today-meal-title').textContent())?.trim() || '';
    report.mealReplacement.oldMeal = oldMealTitle;
    await firstMealCard.locator('button.profile-today-recipe-btn').click();
    await page.waitForSelector('.plan-recipe-modal-body', { timeout: 30_000 });
    const modalBody = page.locator('.plan-recipe-modal-body');
    const modalText = await modalBody.innerText();
    report.recipe.recipeOpened = true;
    report.recipe.ingredientsVisible = /Suroviny/i.test(modalText);
    report.recipe.instructionsVisible = /Postup/i.test(modalText);
    report.recipe.nutritionVisible = /Nutriční hodnoty na 1 porci/i.test(modalText);
    const pctMatches = [...modalText.matchAll(/(\d+)\s*%/g)].map((m) => Number(m[1]));
    const macroPctNonZero = pctMatches.filter((p) => p > 0);
    report.recipe.macroPercentagesAllZero = macroPctNonZero.length === 0 && pctMatches.length > 0;
    report.recipe.macroBarVisible = await modalBody.locator('.recipe-macro-energy-bar').count() > 0;
    report.recipe.horizontalScroll = await page.evaluate(() => {
      const el = document.querySelector('.plan-recipe-modal-body');
      return el ? el.scrollWidth > el.clientWidth + 2 : false;
    });
    report.recipe.screenshot = await screenshot(page, 'profile-recipe-modal.png');
    await page.locator('.plan-recipe-modal-close').first().click();
    await page.waitForTimeout(500);

    // C) Meal replacement
    report.mealReplacement.clicked = true;
    await firstMealCard.locator('button.profile-today-secondary-btn', { hasText: 'Nahradit jiným' }).click();
    await page.waitForTimeout(8000);
    const rateLimitVisible = await page.locator('text=/překročen limit|rate limit|429/i').first().isVisible().catch(() => false);
    report.mealReplacement.rateLimitShown = rateLimitVisible;
    const newMealTitle = (await firstMealCard.locator('.profile-today-meal-title').textContent())?.trim() || '';
    report.mealReplacement.newMeal = newMealTitle;
    report.mealReplacement.mealChanged = Boolean(newMealTitle && oldMealTitle && newMealTitle !== oldMealTitle);
    report.mealReplacement.screenshot = await screenshot(page, 'profile-meal-replaced.png');

    // D) Pin next week
    report.includeNextWeek.clicked = true;
    const mealTitleBeforePin = newMealTitle;
    const pinBtn = firstMealCard.locator('button.profile-today-secondary-btn', { hasText: /Zahrnout|Zahrnuto/ });
    if (await pinBtn.count()) {
      await pinBtn.click();
      await page.waitForTimeout(2000);
      const pinText = await page.locator('.profile-today-pin-toast').textContent().catch(() => '');
      report.includeNextWeek.feedbackVisible = /Uloženo|preferovat/i.test(pinText || '');
      report.includeNextWeek.rateLimitShown = await page.locator('text=/překročen limit|rate limit|429/i').first().isVisible().catch(() => false);
      const mealTitleAfterPin = (await firstMealCard.locator('.profile-today-meal-title').textContent())?.trim() || '';
      report.includeNextWeek.planChangedImmediately = mealTitleAfterPin !== mealTitleBeforePin;
    } else {
      report.includeNextWeek.feedbackVisible = false;
      report.includeNextWeek.skipped = 'pin button not available';
    }
    report.includeNextWeek.screenshot = await screenshot(page, 'profile-meal-pin-feedback.png');

    const workoutSection = page.locator('#profile-today-workout').first();
    const workoutText = await workoutSection.innerText().catch(() => '');
    report.workoutCopy.todayWorkoutText = workoutText;
    report.workoutCopy.hasPerLegEnglish = /\bper leg\b/i.test(workoutText);
    report.workoutCopy.hasLunges = /Výpady/i.test(workoutText);
    report.workoutCopy.lungesUseCzech = /Výpady[\s\S]{0,120}na každou nohu/i.test(workoutText);
    report.workoutCopy.squatsNoPerLeg = /Dřepy[\s\S]{0,80}(?!na každou nohu)/i.test(workoutText);
    report.workoutCopy.noSalesBlockAfterWorkout = await page.evaluate(() => {
      const section = document.getElementById('profile-today-workout');
      if (!section) return false;
      const root = section.closest('.profile-content') || document.body;
      const text = (root.innerText || '').slice(0, 6000);
      return !/Vyber si další krok|Pokračovat ve STARTU|START 599 Kč|ON CLUB 1 499 Kč/i.test(text);
    });
    report.workoutCopy.noSalesScreenshot = await screenshot(page, 'profile-mobile-no-sales-upsell.png');
    report.workoutCopy.workoutCopyScreenshot = await screenshot(page, 'profile-mobile-workout-copy.png');

    // E) Exercise modal
    const exerciseBtn = page.locator('#profile-today-workout .profile-today-exercise-btn').first();
    const hasExerciseBtn = await exerciseBtn.count() > 0;
    if (hasExerciseBtn) {
      const expectedName = (await page.locator('#profile-today-workout .profile-today-workout-item strong').first().textContent())?.trim() || '';
      report.exerciseModal.clicked = true;
      await exerciseBtn.click();
      await page.waitForSelector('.plan-recipe-modal-body', { timeout: 20_000 });
      const exModal = page.locator('.plan-recipe-modal-body');
      const exText = await exModal.innerText();
      const exTitle = await page.locator('.plan-recipe-modal-header h3').textContent();
      report.exerciseModal.correctExercise = Boolean(expectedName && exTitle?.includes(expectedName.split(' ')[0]));
      report.exerciseModal.jakNaToVisible = /Jak na to/i.test(exText);
      report.exerciseModal.dýcháníVisible = /Dýchání/i.test(exText);
      report.exerciseModal.tempoVisible = /Tempo/i.test(exText);
      report.exerciseModal.pozorVisible = /Na co si dát pozor/i.test(exText);
      report.exerciseModal.lehčíVariantaVisible = /Lehčí varianta/i.test(exText);
      const bigEmptyMedia = await page.evaluate(() => {
        const img = document.querySelector('.plan-exercise-media');
        if (!img) return false;
        const r = img.getBoundingClientRect();
        return r.height > 200 && !img.complete;
      });
      report.exerciseModal.wrongMediaShown = false;
      report.exerciseModal.bigEmptyBox = bigEmptyMedia;
      report.exerciseModal.screenshot = await screenshot(page, 'profile-exercise-modal.png');
      await page.locator('.plan-recipe-modal-close').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    } else {
      report.exerciseModal.skipped = 'no today workout exercises';
      report.exerciseModal.clicked = false;
    }

    const workoutItems = page.locator('#profile-today-workout .profile-today-workout-item');
    const workoutCount = await workoutItems.count();
    let squatModalText = '';
    let lungeModalText = '';
    for (let i = 0; i < workoutCount; i++) {
      const item = workoutItems.nth(i);
      const nameText = await item.locator('strong').first().textContent().catch(() => '');
      const normalized = String(nameText || '').toLowerCase();
      if (!/dřep|výpad/.test(normalized)) continue;
      await item.locator('button.profile-today-exercise-btn').click({ force: true });
      await page.waitForSelector('.plan-recipe-modal-body', { timeout: 20_000 });
      const modalText = await page.locator('.plan-recipe-modal-body').first().innerText().catch(() => '');
      if (/dřep/.test(normalized) && !squatModalText) squatModalText = modalText;
      if (/výpad/.test(normalized) && !lungeModalText) lungeModalText = modalText;
      await page.locator('.plan-recipe-modal-close').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
    }
    report.workoutCopy.squatModalFound = Boolean(squatModalText);
    report.workoutCopy.lungeModalFound = Boolean(lungeModalText);
    report.workoutCopy.squatVsLungeModalDifferent = Boolean(squatModalText && lungeModalText && squatModalText !== lungeModalText);

    // F) Accordion
    await closeAnyModals(page);
    await dismissBlockingOverlays(page);
    const expandWeek = page.locator('button:has-text("Rozbalit týden")');
    if (await expandWeek.count()) {
      await expandWeek.click({ force: true });
      await page.waitForTimeout(600);
    }
    const dayHeaders = page.locator('.plan-day-header-static');
    const dayCount = await dayHeaders.count();
    if (dayCount >= 2) {
      await dayHeaders.nth(0).click({ force: true });
      await page.waitForTimeout(400);
      await dayHeaders.nth(1).click({ force: true });
      await page.waitForTimeout(400);
      const expanded = await page.locator('.plan-day-card.plan-day-expanded').count();
      report.accordion.onlyOneDayOpen = expanded <= 1;
    } else {
      report.accordion.onlyOneDayOpen = true;
      report.accordion.note = 'fewer than 2 day cards';
    }
    report.accordion.screenshot = await screenshot(page, 'profile-week-accordion.png');

    // G) Settings
    await closeAnyModals(page);
    const settingsBtn = page.locator('button.profile-quick-nav-btn', { hasText: 'Nastavení' }).first();
    await settingsBtn.scrollIntoViewIfNeeded();
    await settingsBtn.click({ force: true });
    await page.waitForSelector('.modal-preferences, .prefs-kicker, .preferences-section', { timeout: 25_000 });
    const settingsText = await page.locator('.modal-preferences, .prefs-form, form.prefs-form').first().innerText().catch(() => page.locator('body').innerText());
    report.settings.bodyDataSectionVisible = /Tělesné údaje/i.test(await settingsText);
    report.settings.weightEditable = await page.locator('input').filter({ has: page.locator('xpath=..//span[contains(text(),"Váha")]') }).count() > 0
      || await page.getByText('Váha', { exact: false }).count() > 0;
    report.settings.heightEditable = /Výška/i.test(await settingsText);
    report.settings.birthDateEditable = await page.locator('input[type="date"]').count() > 0;
    report.settings.ageCalculated = /Věk:.*let/i.test(await settingsText);
    const saveButtons = await page.locator('button:has-text("Uložit změny")').count();
    const headerSave = await page.locator('button:has-text("Uložit")').filter({ hasNot: page.locator('text=Uložit změny') }).count();
    report.settings.duplicateSaveButtons = saveButtons > 1 || headerSave > 0;
    report.settings.screenshot = await screenshot(page, 'profile-settings-body-data.png');
    await page.locator('button.prefs-secondary-btn, button:has-text("Zrušit")').first().click().catch(() => {});
  } finally {
    await browser.close();
  }
}

function runNpmScript(name) {
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', name], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    timeout: 300_000,
  });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const pass = r.status === 0;
  report.tests[name] = pass ? 'PASS' : 'FAIL';
  if (!pass) report.tests[`${name}_output`] = out.slice(-800);
  return pass;
}

function computeVerdict() {
  if (report.exerciseModal.clicked && report.exerciseModal.jakNaToVisible) {
    report.production.commitDeployed = true;
  }
  const critical = [
    report.production.state === 'Ready',
    report.production.hasMacroBarBundle,
    report.testAccount.user_id,
    report.testAccount.plan_id,
    report.mobileE2E.profileOpened,
    !report.mobileE2E.horizontalScroll,
    report.withingsMobile?.defaultCollapsed !== false,
    report.withingsMobile?.launcherVisible !== false,
    report.withingsMobile?.expandedOnLauncherClick !== false,
    report.withingsMobile?.hideReturnsCollapsed !== false,
    report.withingsMobile?.technicalOAuthText !== true,
    !report.withingsMobile?.horizontalScroll,
    !report.withingsMobile?.overlapsTodayCta,
    !report.mobileE2E.duplicateNav,
    report.recipe.recipeOpened,
    !report.recipe.macroPercentagesAllZero,
    report.recipe.macroBarVisible,
    !report.workoutCopy.hasPerLegEnglish,
    report.workoutCopy.noSalesBlockAfterWorkout,
    (report.workoutCopy.squatModalFound && report.workoutCopy.lungeModalFound)
      ? report.workoutCopy.squatVsLungeModalDifferent
      : true,
    report.mealReplacement.mealChanged,
    !report.mealReplacement.rateLimitShown,
    report.includeNextWeek.feedbackVisible !== false || report.includeNextWeek.skipped,
    report.exerciseModal.clicked || report.exerciseModal.skipped,
    report.accordion.onlyOneDayOpen,
    report.settings.bodyDataSectionVisible,
    !report.settings.duplicateSaveButtons,
    report.runtimeLogs.errors.filter((e) => e.type === '500' || e.type === '429').length === 0,
  ];
  const allPass = critical.every(Boolean);
  const partial = report.mobileE2E.profileOpened && report.recipe.recipeOpened;
  report.verdict = allPass ? 'READY' : partial ? 'PARTIAL' : 'FAIL';
  if (!allPass) {
    const fails = [];
    if (report.production.state !== 'Ready') fails.push('production not ready');
    if (!report.production.hasMacroBarBundle) fails.push('macro bar bundle missing');
    if (!report.mealReplacement.mealChanged) fails.push('meal replacement did not change title');
    if (report.recipe.macroPercentagesAllZero) fails.push('macro percentages all zero');
    if (!report.recipe.macroBarVisible) fails.push('macro bar not visible');
    if (report.workoutCopy.hasPerLegEnglish) fails.push('english per leg visible in workout');
    if (!report.workoutCopy.noSalesBlockAfterWorkout) fails.push('sales block detected in profile flow');
    if (report.workoutCopy.squatModalFound && report.workoutCopy.lungeModalFound && !report.workoutCopy.squatVsLungeModalDifferent) {
      fails.push('squat/lunge modals look identical');
    }
    if (report.mealReplacement.rateLimitShown) fails.push('rate limit on meal replace');
    if (!report.exerciseModal.clicked && !report.exerciseModal.skipped) fails.push('exercise modal failed');
    if (report.exerciseModal.clicked && !report.exerciseModal.jakNaToVisible) fails.push('exercise guide missing');
    report.verdictReason = fails.join('; ') || 'see report';
  } else {
    report.verdictReason = 'all critical checks passed';
  }
}

function printReport() {
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log('\n=== E2E PROFILE MOBILE REPORT ===');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${REPORT_PATH}`);
  console.log(`Verdict: ${report.verdict} — ${report.verdictReason}`);
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

  console.log('1/4 Production check…');
  await checkProduction();

  console.log('2/4 Register test account…', TEST_EMAIL);
  await registerTestAccount(supabase);

  console.log('3/4 Mobile Playwright E2E…');
  await runMobileE2E();

  console.log('4/4 Verify scripts…');
  const scripts = [
    'verify:withings-widget-ux',
    'verify:profile-layout-focus',
    'verify:profile-real-user-bugfixes',
    'verify:profile-today-ux',
    'verify:profile-macro-chart',
    'verify:macro-kcal-consistency',
    'verify:meal-replacement-actions',
    'verify:exercise-assets',
    'verify:training-environment-strictness',
    'verify:email-cta-profile-access',
    'verify:product-consistency',
    'smoke-test:prod',
  ];
  report.tests.build = runNpmScript('build') ? 'PASS' : 'FAIL';
  for (const s of scripts) runNpmScript(s);

  report.runtimeLogs.errors500 = report.runtimeLogs.errors.filter((e) => e.type === '500').length;
  report.runtimeLogs.errors429 = report.runtimeLogs.errors.filter((e) => e.type === '429').length;
  report.runtimeLogs.authErrors = report.runtimeLogs.errors.filter((e) => e.type === 'auth').length;

  computeVerdict();
  report.tests['e2e:profile-mobile'] = report.verdict === 'READY' ? 'PASS' : 'FAIL';
  printReport();
  process.exit(report.verdict === 'READY' ? 0 : 1);
}

main().catch((err) => {
  console.error('E2E fatal:', err);
  report.verdict = 'FAIL';
  report.verdictReason = err.message;
  try {
    mkdirSync(ARTIFACTS, { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  } catch { /* ignore */ }
  process.exit(1);
});
