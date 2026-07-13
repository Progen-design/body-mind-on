#!/usr/bin/env node
/**
 * E2E: workout body map views, highlighting, location/equipment.
 * BASE_URL=https://app.bodyandmindon.cz node scripts/e2e-workout-body-map.mjs
 */
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { chromium, devices } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = join(ROOT, 'artifacts');
mkdirSync(ARTIFACTS, { recursive: true });

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
loadEnv();

const BASE_URL = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const TEST_EMAIL = (process.env.E2E_EMAIL || 'janprikopa@gmail.com').trim().toLowerCase();

const admin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

let failed = 0;
function check(id, ok, detail = '') {
  if (ok) console.log(`OK ${id}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${id}${detail ? ` — ${detail}` : ''}`); }
}

async function login(page) {
  let pageNum = 1;
  let tokenHash = null;
  for (;;) {
    const { data } = await admin.auth.admin.listUsers({ page: pageNum, perPage: 200 });
    const hit = (data?.users || []).find((u) => String(u.email || '').toLowerCase() === TEST_EMAIL);
    if (hit) break;
    if ((data?.users || []).length < 200) throw new Error('User not found');
    pageNum += 1;
  }
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_EMAIL,
    options: { redirectTo: `${BASE_URL}/profil` },
  });
  if (error) throw error;
  tokenHash = data?.properties?.hashed_token;
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (otpErr || !otpData?.session) throw otpErr || new Error('verifyOtp failed');
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', '').split('.')[0];
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.evaluate(({ storageKey, sessionPayload }) => {
    localStorage.setItem(storageKey, JSON.stringify(sessionPayload));
  }, { storageKey: `sb-${ref}-auth-token`, sessionPayload: otpData.session });
}

async function openWorkoutModal(page) {
  await page.goto(`${BASE_URL}/profil`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(2000);
  const btn = page.getByRole('button', { name: /Změnit dnešní trénink/i });
  if (!(await btn.count())) return false;
  await btn.click();
  await page.locator('.wcm-overlay').waitFor({ state: 'visible', timeout: 15_000 });
  return true;
}

async function highlightedCount(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('.muscle-body-svg');
    if (!svg) return 0;
    return svg.querySelectorAll('ellipse[aria-pressed="true"]').length;
  });
}

async function activeView(page) {
  return page.evaluate(() => {
    const front = document.querySelector('.wcm-view-toggle button.active');
    return front?.textContent?.includes('Zepředu') ? 'front' : 'back';
  });
}

async function runScenarios(page, prefix) {
  await page.locator('button.wcm-preset:has-text("Břicho")').click();
  await page.waitForTimeout(300);
  check(`${prefix}_A_core_front`, (await activeView(page)) === 'front' && (await highlightedCount(page)) >= 1);

  await page.locator('button.wcm-preset:has-text("Prsa + triceps")').click();
  await page.waitForTimeout(300);
  check(`${prefix}_B_chest_triceps_front`, (await activeView(page)) === 'front' && (await highlightedCount(page)) >= 3);

  await page.locator('button.wcm-preset:has-text("Záda + biceps")').click();
  await page.waitForTimeout(300);
  const backCount = await highlightedCount(page);
  check(`${prefix}_C_back_biceps_back`, (await activeView(page)) === 'back' && backCount >= 3);

  await page.locator('button.wcm-preset:has-text("Celé tělo")').click();
  await page.waitForTimeout(300);
  const frontHl = await highlightedCount(page);
  await page.locator('.wcm-view-toggle button:has-text("Zezadu")').click();
  await page.waitForTimeout(300);
  const backHl = await highlightedCount(page);
  check(`${prefix}_D_full_body_both_views`, frontHl >= 5 && backHl >= 5);

  await page.locator('.wcm-pills button:has-text("Fitness centrum")').click();
  await page.waitForTimeout(200);
  const gymEquip = await page.locator('.wcm-pills button.on:has-text("Plně vybavené fitness")').count();
  check(`${prefix}_E_gym_default_equip`, gymEquip >= 1);

  await page.locator('.wcm-pills button:has-text("Doma")').click();
  await page.waitForTimeout(200);
  const homeEquip = await page.locator('.wcm-pills button.on:has-text("Základní vybavení")').count();
  check(`${prefix}_E_home_default_equip`, homeEquip >= 1);

  await page.locator('.wcm-pills button:has-text("Venku")').click();
  await page.waitForTimeout(200);
  const outdoorEquip = await page.locator('.wcm-pills button.on:has-text("Bez vybavení")').count();
  check(`${prefix}_E_outdoor_default_equip`, outdoorEquip >= 1);

  await page.locator('.wcm-pills button:has-text("Bez vybavení")').click();
  await page.waitForTimeout(200);
  const manualEquip = await page.locator('.wcm-pills button.on:has-text("Bez vybavení")').count();
  check(`${prefix}_E_manual_equip_change`, manualEquip >= 1);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dpage = await desktop.newPage();
  await login(dpage);
  const opened = await openWorkoutModal(dpage);
  if (!opened) {
    check('modal_open', false, 'Změnit dnešní trénink not available');
  } else {
    await runScenarios(dpage, 'desktop');
    await dpage.screenshot({ path: join(ARTIFACTS, 'e2e-body-map-desktop.png'), fullPage: true });
    await dpage.locator('.wcm-close').click();
  }
  await desktop.close();

  const mobile = await browser.newContext({ ...devices['iPhone 13'] });
  const mpage = await mobile.newPage();
  await login(mpage);
  if (await openWorkoutModal(mpage)) {
    await runScenarios(mpage, 'mobile');
    const scrollW = await mpage.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await mpage.evaluate(() => document.documentElement.clientWidth);
    check('mobile_no_horizontal_scroll', scrollW <= clientW + 2);
    await mpage.screenshot({ path: join(ARTIFACTS, 'e2e-body-map-mobile.png'), fullPage: true });
  }
  await mobile.close();
  await browser.close();

  console.log(failed ? `\nE2E RESULT: FAIL (${failed})` : '\nE2E RESULT: PASS');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E fatal:', err);
  process.exit(1);
});
