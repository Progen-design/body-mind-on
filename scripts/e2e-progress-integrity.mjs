#!/usr/bin/env node
/**
 * E2E progres – scénáře A–D + mobilní layout.
 * BASE_URL=https://app.bodyandmindon.cz node scripts/e2e-progress-integrity.mjs
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

async function findUserIdByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users || []).find((u) => String(u.email || '').toLowerCase() === email);
    if (hit?.id) return hit.id;
    if ((data?.users || []).length < 200) break;
    page += 1;
  }
  return null;
}

async function login(page) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_EMAIL,
    options: { redirectTo: `${BASE_URL}/profil` },
  });
  if (error) throw error;
  const tokenHash = data?.properties?.hashed_token;
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (otpErr || !otpData?.session) throw otpErr || new Error('verifyOtp failed');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const ref = supabaseUrl.replace('https://', '').split('.')[0];
  const storageKey = `sb-${ref}-auth-token`;
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.evaluate(({ storageKey, sessionPayload }) => {
    localStorage.setItem(storageKey, JSON.stringify(sessionPayload));
  }, { storageKey, sessionPayload: otpData.session });
}

async function openProgressTab(page) {
  await page.goto(`${BASE_URL}/profil`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(2000);
  const stats = page.locator('#statistiky');
  if (await stats.count()) {
    const header = page.locator('#profile-bubble-header-statistiky');
    if (await header.count()) await header.click();
  }
  await page.getByRole('tab', { name: 'Progres' }).click();
  await page.waitForTimeout(800);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);
  await openProgressTab(page);

  const bodyText = await page.locator('.profile-progress-integrity').innerText().catch(() => '');
  check('A no modeled weight copy', !bodyText.includes('Z tréninků') && !bodyText.includes('kg tuku'));
  check('A no silhouette', (await page.locator('.body-figures-row').count()) === 0);
  check('A progress section visible', (await page.locator('.profile-progress-integrity').count()) > 0);

  const hasMeasurementCta = bodyText.includes('Přidat měření') || bodyText.includes('měření');
  check('A/B measurement CTA or state', hasMeasurementCta);

  const periodBtn = page.locator('.profile-progress-period').first();
  if (await periodBtn.count()) {
    await page.getByRole('tab', { name: '30 dní' }).click();
    await page.waitForTimeout(400);
    check('D period switch works', (await page.locator('.profile-progress-period--active').innerText()).includes('30'));
  }

  const activityBlock = await page.locator('.profile-progress-block').first().innerText();
  check('D activity block neutral', !activityBlock.includes('hubneš') && !activityBlock.includes('zlepšuješ'));

  // Mobile viewport
  const mobile = await browser.newContext({ ...devices['iPhone 13'] });
  const mpage = await mobile.newPage();
  await login(mpage);
  await openProgressTab(mpage);
  const scrollW = await mpage.evaluate(() => document.documentElement.scrollWidth);
  const clientW = await mpage.evaluate(() => document.documentElement.clientWidth);
  check('mobile no horizontal scroll', scrollW <= clientW + 2);
  await mpage.screenshot({ path: join(ARTIFACTS, 'e2e-progress-mobile.png'), fullPage: true });
  await mobile.close();

  await page.screenshot({ path: join(ARTIFACTS, 'e2e-progress-desktop.png'), fullPage: true });
  await browser.close();

  console.log(failed ? `\nE2E RESULT: FAIL (${failed})` : '\nE2E RESULT: PASS');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E fatal:', err);
  process.exit(1);
});
