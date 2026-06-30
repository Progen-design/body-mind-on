#!/usr/bin/env node
/**
 * Ověření UX Withings widgetu v profilu.
 *   npm run verify:withings-widget-ux
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
const PORT = process.env.VERIFY_WITHINGS_PORT || '3022';
const BASE_URL = (process.env.BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const TIMESTAMP = Date.now();
const TEST_EMAIL = process.env.VERIFY_WITHINGS_EMAIL
  || process.env.E2E_EMAIL
  || `info+bm-withings-ux-${TIMESTAMP}@bodyandmindon.cz`;
const TEST_PASSWORD = process.env.VERIFY_WITHINGS_PASSWORD || process.env.E2E_PASSWORD || 'WithingsUx2026!';

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

console.log('--- Static Withings widget checks ---');
const withingsCard = read('components/profile/WithingsProfileCard.js');
const latestApi = read('pages/api/withings/latest.js');
const packageJson = read('package.json');

check('default collapsed state', /useState\(true\)/.test(withingsCard) && withingsCard.includes('bm-withings-widget-collapsed'));
check('launcher button exists', withingsCard.includes('withings-launcher') && withingsCard.includes('Váha'));
check('Skrýt collapses widget', withingsCard.includes('hideCard') && withingsCard.includes('persistCollapsedPreference'));
check('not_configured friendly copy', withingsCard.includes('Chytrá váha zatím není aktivní.'));
check('Připravujeme disabled button', withingsCard.includes('Připravujeme'));
check('sanitize technical OAuth messages', withingsCard.includes('sanitizeUserMessage'));
check('no technical OAuth text in JSX', !withingsCard.includes('klientské údaje') && !withingsCard.includes('OAuth není nakonfigurován'));
check('mobile max height 80vh', /80vh/.test(withingsCard));
check('desktop max width ~400px', /min\(400px/.test(withingsCard));
check('latest API exposes configured', latestApi.includes('isWithingsOAuthConfigured') && latestApi.includes('configured'));
check('npm script verify:withings-widget-ux', packageJson.includes('"verify:withings-widget-ux"'));

const badMobileWidth = withingsCard.match(/width:\s*(\d{3,})px/g) || [];
const mobileBlock = withingsCard.split('@media (max-width: 640px)')[1] || '';
check('mobile CSS bez fixed width >100vw', !mobileBlock.match(/width:\s*(4[3-9]\d|[5-9]\d{2}|\d{4,})px/));

async function registerIfNeeded(supabase) {
  const payload = {
    email: TEST_EMAIL,
    name: 'Withings UX',
    password: TEST_PASSWORD,
    gender: 'male',
    age: 35,
    height: 182,
    weight: 84,
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
  await page.waitForFunction(
    () => Boolean(document.querySelector('.withings-floating-card') || document.querySelector('#profile-today-heading')),
    null,
    { timeout: 120_000 },
  );
  await sleep(800);
}

async function inspectWithings(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.withings-floating-card');
    const launcher = document.querySelector('.withings-launcher');
    const panel = document.querySelector('.withings-panel');
    const bodyText = card?.innerText || '';
    const connectBtn = [...document.querySelectorAll('.withings-actions button')].find((b) => /Propojit Withings|Připravujeme/i.test(b.textContent || ''));
    const syncBtn = [...document.querySelectorAll('.withings-actions button')].find((b) => /Sync teď/i.test(b.textContent || ''));
    const historyBtn = [...document.querySelectorAll('.withings-actions button')].find((b) => /Historie/i.test(b.textContent || ''));
    const today = document.getElementById('profile-today-heading');
    const cardRect = card?.getBoundingClientRect();
    const todayRect = today?.getBoundingClientRect();
    const style = card ? window.getComputedStyle(card) : null;
    return {
      collapsed: card?.classList.contains('is-collapsed') || card?.dataset.withingsCollapsed === '1',
      expanded: card?.classList.contains('is-expanded'),
      hasLauncher: Boolean(launcher),
      hasPanel: Boolean(panel),
      bodyText,
      connectDisabled: connectBtn ? connectBtn.disabled : null,
      syncDisabled: syncBtn ? syncBtn.disabled : null,
      historyDisabled: historyBtn ? historyBtn.disabled : null,
      horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      cardWidth: cardRect ? cardRect.width : null,
      viewportWidth: window.innerWidth,
      overlapsToday: cardRect && todayRect
        ? cardRect.top < todayRect.bottom && cardRect.bottom > todayRect.top && cardRect.left < todayRect.right && cardRect.right > todayRect.left
        : false,
      cardWidthCss: style?.width || null,
    };
  });
}

async function runVisualChecks() {
  if (process.env.SKIP_WITHINGS_WIDGET_VISUAL === '1') {
    console.log('SKIP visual checks (SKIP_WITHINGS_WIDGET_VISUAL=1)');
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
  console.log('\n--- Visual Withings widget checks ---');
  mkdirSync(ARTIFACTS, { recursive: true });

  try {
    await registerIfNeeded(supabase);
  } catch (err) {
    check('registrace test účtu', false, err.message);
    return;
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const mobileContext = await browser.newContext({
      ...devices['iPhone 14'],
      viewport: { width: 390, height: 844 },
      locale: 'cs-CZ',
      timezoneId: 'Europe/Prague',
    });
    const mobilePage = await mobileContext.newPage();
    await loginAndOpenProfile(mobilePage);
    const collapsedMobile = await inspectWithings(mobilePage);
    check('mobile default collapsed', collapsedMobile.collapsed && collapsedMobile.hasLauncher && !collapsedMobile.hasPanel);
    check('mobile launcher visible', collapsedMobile.hasLauncher);
    check('mobile bez technického OAuth textu', !/oauth|klientské údaje|dashboard|env/i.test(collapsedMobile.bodyText));
    check('mobile card width <= viewport', collapsedMobile.cardWidth == null || collapsedMobile.cardWidth <= collapsedMobile.viewportWidth + 2, String(collapsedMobile.cardWidth));
    check('mobile bez horizontálního scrollu', !collapsedMobile.horizontalScroll);
    await mobilePage.screenshot({ path: join(ARTIFACTS, 'withings-collapsed-mobile.png'), fullPage: false });

    await mobilePage.locator('.withings-launcher').click();
    await sleep(500);
    const expandedMobile = await inspectWithings(mobilePage);
    check('mobile expand on launcher click', expandedMobile.expanded && expandedMobile.hasPanel);
    check('mobile expanded bez OAuth technického textu', !/oauth|klientské údaje|dashboard|env/i.test(expandedMobile.bodyText));
    check('mobile expanded card width <= viewport', expandedMobile.cardWidth <= expandedMobile.viewportWidth + 2, String(expandedMobile.cardWidth));
    if (/Připravujeme/i.test(expandedMobile.bodyText)) {
      check('mobile Připravujeme je disabled', expandedMobile.connectDisabled === true);
      check('mobile not_configured copy', /Chytrá váha zatím není aktivní/i.test(expandedMobile.bodyText));
    } else {
      check('mobile Sync/Historie disabled when not connected', expandedMobile.syncDisabled === true && expandedMobile.historyDisabled === true);
    }
    await mobilePage.screenshot({ path: join(ARTIFACTS, 'withings-expanded-mobile.png'), fullPage: false });

    await mobilePage.locator('.withings-close').click();
    await sleep(400);
    const hiddenMobile = await inspectWithings(mobilePage);
    check('mobile Skrýt vrátí collapsed', hiddenMobile.collapsed && hiddenMobile.hasLauncher);
    await mobileContext.close();

    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'cs-CZ',
      timezoneId: 'Europe/Prague',
    });
    const desktopPage = await desktopContext.newPage();
    await loginAndOpenProfile(desktopPage);
    const collapsedDesktop = await inspectWithings(desktopPage);
    check('desktop default collapsed', collapsedDesktop.collapsed && collapsedDesktop.hasLauncher);
    check('desktop collapsed nepřekrývá dnešní CTA', !collapsedDesktop.overlapsToday);
    await desktopPage.screenshot({ path: join(ARTIFACTS, 'withings-collapsed-desktop.png'), fullPage: false });

    await desktopPage.locator('.withings-launcher').click();
    await sleep(500);
    const expandedDesktop = await inspectWithings(desktopPage);
    check('desktop expand on launcher click', expandedDesktop.expanded && expandedDesktop.hasPanel);
    check('desktop card max width reasonable', expandedDesktop.cardWidth <= 420, String(expandedDesktop.cardWidth));
    await desktopPage.screenshot({ path: join(ARTIFACTS, 'withings-expanded-desktop.png'), fullPage: false });

    await desktopPage.evaluate(() => {
      window.localStorage.setItem('bm-withings-widget-collapsed', '1');
    });
    await desktopPage.reload({ waitUntil: 'networkidle' });
    await sleep(800);
    const persisted = await inspectWithings(desktopPage);
    check('collapsed state persists after refresh', persisted.collapsed && persisted.hasLauncher);
    await desktopContext.close();
  } catch (err) {
    check('visual checks', false, err.message);
  } finally {
    await browser.close();
  }
}

await runVisualChecks();

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
