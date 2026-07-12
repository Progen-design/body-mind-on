#!/usr/bin/env node
/**
 * Ověření UX Withings sekce v profilu (inline Tělesný vývoj).
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

  async function loginPageReady(url) {
    try {
      const res = await fetch(`${url}/login`, { signal: AbortSignal.timeout(5000) });
      const html = await res.text();
      return res.ok && html.includes('__NEXT_DATA__') && /Přihl/i.test(html);
    } catch {
      return false;
    }
  }

  if (await loginPageReady(BASE_URL)) return;

  const startPort = Number(new URL(BASE_URL).port || PORT);
  for (let offset = 0; offset < 8; offset++) {
    const port = String(startPort + offset);
    const url = `http://127.0.0.1:${port}`;
    if (await loginPageReady(url)) {
      process.env.BASE_URL = url;
      return;
    }
    console.log(`Starting local server at ${url}…`);
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'start', '--', '-p', port], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    child.unref();
    for (let i = 0; i < 45; i++) {
      if (await loginPageReady(url)) {
        process.env.BASE_URL = url;
        console.log('Local server ready');
        await sleep(2500);
        return;
      }
      await sleep(1000);
    }
  }
  throw new Error(`Local next start did not become ready near port ${startPort}`);
}

console.log('--- Static Withings section checks ---');
const withingsSection = read('components/profile/WithingsBodyDevelopmentSection.js');
const withingsCard = read('components/profile/WithingsProfileCard.js');
const latestApi = read('pages/api/withings/latest.js');
const packageJson = read('package.json');

check('WithingsProfileCard re-export', withingsCard.includes('WithingsBodyDevelopmentSection'));
check('section hidden without visibility', withingsSection.includes('if (!sectionVisible) return null'));
check('shouldShowWithingsSection gating', withingsSection.includes('shouldShowWithingsSection'));
check('shouldShowWithingsConnectUi gating', withingsSection.includes('shouldShowWithingsConnectUi'));
check('inline section class', withingsSection.includes('withings-body-dev'));
check('Tělesný vývoj heading', withingsSection.includes('Tělesný vývoj'));
check('Připojit Withings CTA', withingsSection.includes('Připojit Withings'));
check('unified gradient on CTA', withingsSection.includes('#0EA5E9 0%, #A78BFA 100%'));
check('CTA min-height 44px', withingsSection.includes('min-height: 44px'));
check('no technical OAuth text in JSX', !withingsSection.includes('klientské údaje') && !withingsSection.includes('OAuth není nakonfigurován'));
check('latest API exposes configured', latestApi.includes('isWithingsOAuthConfigured') && latestApi.includes('configured'));
check('npm script verify:withings-widget-ux', packageJson.includes('"verify:withings-widget-ux"'));

const mobileBlock = withingsSection.split('@media (max-width: 640px)')[1] || '';
check('mobile CSS bez fixed width >100vw', !mobileBlock.match(/width:\s*(4[3-9]\d|[5-9]\d{2}|\d{4,})px/));

async function ensureWithingsOptIn(supabase) {
  const { data: listed } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const testUser = (listed?.users || []).find((u) => String(u.email || '').toLowerCase() === TEST_EMAIL.toLowerCase());
  if (testUser?.id) {
    const meta = testUser.user_metadata || {};
    await supabase.auth.admin.updateUserById(testUser.id, {
      user_metadata: {
        ...meta,
        wants_body_tracking: true,
        smart_scale_provider: 'withings',
      },
    });
  }
}

async function registerIfNeeded(supabase, baseUrl) {
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
    smart_scale_choice: 'withings',
    workout_days: [1, 3, 5],
    training_environment: 'gym',
    available_equipment: [],
    diet_type: 'standard',
  };
  const res = await fetchWithTimeout(
    `${baseUrl}/api/body-metrics`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    FETCH_TIMEOUT.BODY_METRICS,
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !(res.status === 503 && body.hasUserId)) {
    throw new Error(`Registration failed HTTP ${res.status}: ${body.error || JSON.stringify(body)}`);
  }
  await ensureWithingsOptIn(supabase);
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

async function loginAndOpenProfile(page, baseUrl) {
  await page.goto(`${baseUrl}/login?redirect=/profil`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  const emailInput = page.locator('input.login-input[type="email"], input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 45_000 });
  await emailInput.fill(TEST_EMAIL);
  await page.locator('input.login-input[type="password"], input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button.login-submit').click();
  await page.waitForURL(/\/profil/, { timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(document.querySelector('.withings-body-dev') || document.querySelector('#profile-today-heading')),
    null,
    { timeout: 120_000 },
  );
  await sleep(800);
}

async function inspectWithingsSection(page) {
  return page.evaluate(() => {
    const section = document.querySelector('.withings-body-dev');
    const connectBtn = [...document.querySelectorAll('.withings-actions button')].find((b) => /Připojit Withings|Synchronizovat teď/i.test(b.textContent || ''));
    const today = document.getElementById('profile-today-heading');
    const sectionRect = section?.getBoundingClientRect();
    const todayRect = today?.getBoundingClientRect();
    const btnStyle = connectBtn ? window.getComputedStyle(connectBtn) : null;
    const bodyText = section?.innerText || '';
    return {
      hasSection: Boolean(section),
      hasConnectBtn: Boolean(connectBtn),
      connectDisabled: connectBtn ? connectBtn.disabled : null,
      connectMinHeight: btnStyle ? parseFloat(btnStyle.minHeight) : null,
      horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      sectionWidth: sectionRect ? sectionRect.width : null,
      viewportWidth: window.innerWidth,
      overlapsToday: sectionRect && todayRect
        ? sectionRect.top < todayRect.bottom && sectionRect.bottom > todayRect.top
          && sectionRect.left < todayRect.right && sectionRect.right > todayRect.left
        : false,
      bodyText,
      heading: section?.querySelector('h2')?.textContent || '',
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

  const runtimeBaseUrl = (process.env.BASE_URL || BASE_URL).replace(/\/$/, '');

  const supabase = createClient(supabaseUrl, serviceKey);
  console.log('\n--- Visual Withings section checks ---');
  mkdirSync(ARTIFACTS, { recursive: true });

  try {
    await registerIfNeeded(supabase, runtimeBaseUrl);
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
    await loginAndOpenProfile(mobilePage, runtimeBaseUrl);
    const mobileState = await inspectWithingsSection(mobilePage);
    check('mobile Withings sekce viditelná (opt-in)', mobileState.hasSection);
    check('mobile Tělesný vývoj heading', /Tělesný vývoj/i.test(mobileState.heading));
    check('mobile Připojit/Sync CTA', mobileState.hasConnectBtn);
    check('mobile CTA min-height >= 44px', mobileState.connectMinHeight == null || mobileState.connectMinHeight >= 44, String(mobileState.connectMinHeight));
    check('mobile bez technického OAuth textu', !/oauth|klientské údaje|dashboard|env/i.test(mobileState.bodyText));
    check('mobile card width <= viewport', mobileState.sectionWidth == null || mobileState.sectionWidth <= mobileState.viewportWidth + 2, String(mobileState.sectionWidth));
    check('mobile bez horizontálního scrollu', !mobileState.horizontalScroll);
    await mobilePage.screenshot({ path: join(ARTIFACTS, 'withings-section-mobile.png'), fullPage: false });
    await mobileContext.close();

    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'cs-CZ',
      timezoneId: 'Europe/Prague',
    });
    const desktopPage = await desktopContext.newPage();
    await loginAndOpenProfile(desktopPage, runtimeBaseUrl);
    const desktopState = await inspectWithingsSection(desktopPage);
    check('desktop Withings sekce viditelná (opt-in)', desktopState.hasSection);
    check('desktop nepřekrývá dnešní CTA', !desktopState.overlapsToday);
    check('desktop CTA min-height >= 44px', desktopState.connectMinHeight == null || desktopState.connectMinHeight >= 44, String(desktopState.connectMinHeight));
    await desktopPage.screenshot({ path: join(ARTIFACTS, 'withings-section-desktop.png'), fullPage: false });
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
