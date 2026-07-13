#!/usr/bin/env node
/**
 * Ověření above-the-fold UX profilu — bez velkých programových karet nahoře.
 *   npm run verify:profile-layout-focus
 */
import { mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright';
import { fetchWithTimeout, FETCH_TIMEOUT } from './lib/fetchWithTimeout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTIFACTS = join(ROOT, 'artifacts');
const DESKTOP_SHOT = join(ARTIFACTS, 'profile-desktop-above-fold.png');
const MOBILE_SHOT = join(ARTIFACTS, 'profile-mobile-above-fold.png');
const PORT = process.env.VERIFY_PROFILE_PORT || '3021';
const BASE_URL = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const TIMESTAMP = Date.now();
const TEST_EMAIL = process.env.VERIFY_PROFILE_EMAIL
  || process.env.E2E_EMAIL
  || `info+bm-layout-focus-${TIMESTAMP}@bodyandmindon.cz`;
const TEST_PASSWORD = process.env.VERIFY_PROFILE_PASSWORD || process.env.E2E_PASSWORD || 'LayoutFocus2026!';

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

function read(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
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
    const html = await res.text();
    if (res.ok && html.includes('login-submit') && html.includes('type="email"')) return;
  } catch {
    // start below
  }
  console.log(`Starting local server at ${BASE_URL}…`);
  const port = new URL(BASE_URL).port || PORT;
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'start', '--', '-p', port], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  child.unref();
  for (let i = 0; i < 45; i++) {
    try {
      const res = await fetch(`${BASE_URL}/login`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        console.log('Local server ready');
        await sleep(2500);
        return;
      }
    } catch {
      // retry
    }
    await sleep(1000);
  }
  throw new Error(`Local next start did not become ready on port ${new URL(BASE_URL).port || PORT}`);
}

console.log('--- Static layout checks ---');
const profil = read('pages/profil.js');
const planViewer = read('components/PlanViewer.js');
const packageJson = read('package.json');

const programVariantsIdx = profil.indexOf('<ProgramVariantsSection');
const upsellIdx = profil.indexOf('<ProfileContinuationUpsell');
const todayHeadingInPlanViewer = planViewer.indexOf('ProfileTodayPanels');

check('profil neobsahuje ProgramVariantsSection', programVariantsIdx < 0);
check('profil neobsahuje text Vyber si další krok', !profil.includes('Vyber si další krok'));
check('profil neobsahuje ProfileContinuationUpsell', upsellIdx < 0);
check('PlanViewer nescrolluje na profile-continuation-upsell', !planViewer.includes("getElementById('profile-continuation-upsell')"));
check('profil má profile-hero--compact', profil.includes('profile-hero--compact'));
check('page padding-top není extrémní', /\.page\s*\{[\s\S]*?padding:\s*max\(8px,\s*env\(safe-area-inset-top\)\)/.test(profil));
check('hero inner padding zmenšené', profil.includes('padding: 18px 24px 20px'));
check('hero nemá min-height 40vh+', !/profile-hero[\s\S]{0,200}min-height:\s*(4\d|[5-9]\d|\d{3,})vh/.test(profil));
check('Dnes máš jasno je napojené přes ProfileTodayPanels', todayHeadingInPlanViewer >= 0);
check('npm script verify:profile-layout-focus', packageJson.includes('"verify:profile-layout-focus"'));

async function registerIfNeeded(supabase) {
  const payload = {
    email: TEST_EMAIL,
    name: 'Layout Focus',
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
  const res = await fetchWithTimeout(
    `${BASE_URL}/api/body-metrics`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    FETCH_TIMEOUT.BODY_METRICS,
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !(res.status === 503 && body.hasUserId)) {
    throw new Error(`Registration failed HTTP ${res.status}: ${body.error || JSON.stringify(body)}`);
  }
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const { data: plan } = await supabase
      .from('ai_generated_plans')
      .select('id, structured_plan_json, plan_html')
      .eq('email', TEST_EMAIL)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const hasPlan = (plan?.plan_html && String(plan.plan_html).length > 500)
      || plan?.structured_plan_json?.days?.length;
    if (hasPlan || body.plan_state === 'ready' || body.planSent) return;
    await sleep(2000);
  }
  if (body.plan_state === 'ready' || body.planSent) return;
  throw new Error('Plan not ready within 90s');
}

async function loginAndOpenProfile(page) {
  await page.goto(`${BASE_URL}/login?redirect=/profil`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.locator('input.login-input[type="email"], input[type="email"]').first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.locator('input.login-input[type="email"], input[type="email"]').first().fill(TEST_EMAIL);
  await page.locator('input.login-input[type="password"], input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button.login-submit').click();
  await page.waitForURL(/\/profil/, { timeout: 60_000 });
  await page.evaluate(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(
    () => Boolean(
      document.querySelector('#profile-today-heading')
      || document.querySelector('#muj-plan')
      || document.querySelector('.profile-content')
      || document.querySelector('.profile-bubbles')
    ),
    null,
    { timeout: 120_000 },
  ).catch(() => {});
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
  await sleep(800);
}

async function measureAboveFold(page) {
  return page.evaluate(() => {
    const viewportH = window.innerHeight;
    const header = document.querySelector('header.header');
    const hero = document.querySelector('.profile-hero');
    const today = document.getElementById('profile-today-heading')
      || [...document.querySelectorAll('h2,h3')].find((el) => el.textContent?.includes('Dnes máš jasno'));
    const variants = document.getElementById('program-variants');
    const hasSalesCopy = /Vyber si další krok|Pokračovat ve STARTU|START 599 Kč|ON CLUB 1 499 Kč/i.test(document.body?.innerText || '');
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
    const heroTop = hero ? hero.getBoundingClientRect().top : null;
    const headerGap = heroTop != null ? heroTop - headerBottom : null;
    const todayTop = today ? today.getBoundingClientRect().top : null;
    const variantsInFold = variants
      ? variants.getBoundingClientRect().top < viewportH && variants.getBoundingClientRect().bottom > 0
      : false;
    const bigVariantCards = [...document.querySelectorAll('.program-variants__card')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top < viewportH && r.bottom > 0;
    }).length;
    const mainChildren = [...document.querySelectorAll('main.page > *')].slice(0, 6).map((el) => ({
      tag: el.tagName,
      cls: String(el.className || '').slice(0, 48),
      top: Math.round(el.getBoundingClientRect().top),
      h: Math.round(el.getBoundingClientRect().height),
    }));
    return {
      scrollY: window.scrollY,
      heroTop,
      headerGap,
      mainChildren,
      todayTop,
      variantsInFold,
      bigVariantCards,
      hasSalesCopy,
      horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    };
  });
}

async function runVisualChecks() {
  if (process.env.SKIP_PROFILE_LAYOUT_VISUAL === '1') {
    console.log('SKIP visual checks (SKIP_PROFILE_LAYOUT_VISUAL=1)');
    return;
  }

  loadEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    check('Supabase env pro visual checks', false, 'missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  try {
    await ensureLocalServer();
  } catch (err) {
    check('local server pro visual checks', false, err.message);
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  console.log('\n--- Visual / E2E layout checks ---');
  mkdirSync(ARTIFACTS, { recursive: true });

  try {
    await registerIfNeeded(supabase);
  } catch (err) {
    check('registrace test účtu', false, err.message);
    return;
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'cs-CZ',
      timezoneId: 'Europe/Prague',
    });
    const desktopPage = await desktopContext.newPage();
    await loginAndOpenProfile(desktopPage);
    const desktopMetrics = await measureAboveFold(desktopPage);
    check('desktop scroll je nahoře', desktopMetrics.scrollY < 8, `scrollY=${desktopMetrics.scrollY}`);
    await desktopPage.screenshot({ path: DESKTOP_SHOT, fullPage: false });
    check('desktop screenshot uložen', existsSync(DESKTOP_SHOT), DESKTOP_SHOT);
    check('desktop obsahuje Dnes máš jasno', desktopMetrics.todayTop != null, `top=${desktopMetrics.todayTop}`);
    check('desktop bez velké mezery pod headerem', desktopMetrics.headerGap != null && desktopMetrics.headerGap <= 16, `gap=${desktopMetrics.headerGap}, children=${JSON.stringify(desktopMetrics.mainChildren)}`);
    check('desktop bez program-variants ve foldu', !desktopMetrics.variantsInFold);
    check('desktop bez velkých variantních karet ve foldu', desktopMetrics.bigVariantCards === 0, String(desktopMetrics.bigVariantCards));
    await desktopContext.close();

    const mobileContext = await browser.newContext({
      ...devices['iPhone 14'],
      viewport: { width: 390, height: 844 },
      locale: 'cs-CZ',
      timezoneId: 'Europe/Prague',
    });
    const mobilePage = await mobileContext.newPage();
    await loginAndOpenProfile(mobilePage);
    const mobileMetrics = await measureAboveFold(mobilePage);
    check('mobile scroll je nahoře', mobileMetrics.scrollY < 8, `scrollY=${mobileMetrics.scrollY}`);
    await mobilePage.screenshot({ path: MOBILE_SHOT, fullPage: false });
    check('mobile screenshot uložen', existsSync(MOBILE_SHOT), MOBILE_SHOT);
    check('mobile hero hned pod headerem', mobileMetrics.headerGap != null && mobileMetrics.headerGap <= 16, `gap=${mobileMetrics.headerGap}, children=${JSON.stringify(mobileMetrics.mainChildren)}`);
    check('mobile bez horizontálního scrollu', !mobileMetrics.horizontalScroll);
    check('mobile bez program-variants ve foldu', !mobileMetrics.variantsInFold);
    check('mobile bez sales copy v profilu', !mobileMetrics.hasSalesCopy);
    await mobileContext.close();
  } catch (err) {
    check('visual checks', false, err.message);
  } finally {
    await browser.close();
  }
}

await runVisualChecks();

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
