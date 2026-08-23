#!/usr/bin/env node
/**
 * Dočasný E2E: weekly modern UI + birthdate persistence.
 *   BASE_URL=http://127.0.0.1:3040 node scripts/tmp-e2e-weekly-birthdate.mjs
 */
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium, devices } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTIFACTS = join(ROOT, 'artifacts');
mkdirSync(ARTIFACTS, { recursive: true });

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:3040').replace(/\/$/, '');
const PREFIX = process.env.SHOT_PREFIX || 'after-weekly-birthdate';
const TIMESTAMP = Date.now();
const TEST_EMAIL = process.env.E2E_EMAIL_OVERRIDE || `info+bm-birthdate-audit-${TIMESTAMP}@bodyandmindon.cz`;
const TEST_PASSWORD = 'BirthdateE2e2026!';
const BIRTH_DATE = '1992-06-15';
const BIRTH_DATE_EDITED = '1990-03-10';

const results = { baseUrl: BASE_URL, email: TEST_EMAIL, checks: {}, verdict: 'FAIL' };
let failed = 0;
function check(label, ok, detail = '') {
  results.checks[label] = ok ? 'OK' : `FAIL${detail ? ` (${detail})` : ''}`;
  if (ok) console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

function expectedAge(birthIso, ref = new Date()) {
  const [y, m, d] = birthIso.split('-').map(Number);
  let age = ref.getFullYear() - y;
  if (ref.getMonth() + 1 - m < 0 || (ref.getMonth() + 1 === m && ref.getDate() < d)) age -= 1;
  return age;
}

async function registerAccount() {
  const today = new Date().getDay();
  const res = await fetch(`${BASE_URL}/api/body-metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL,
      name: 'Birthdate Audit',
      password: TEST_PASSWORD,
      gender: 'male',
      birth_date: BIRTH_DATE,
      height: 182,
      weight: 84,
      activity: 'Střední aktivita',
      stress: 'stredni',
      worktype: 'sedave',
      goal: 'Nabrat svaly',
      frequency: '3x týdně',
      workout_days: [...new Set([2, 4, today])],
      training_environment: 'gym',
      program: 'START',
      selected_habits: ['training', 'hydration'],
    }),
  });
  const data = await res.json().catch(() => ({}));
  check('registrace vrátila 200', res.status === 200, `status=${res.status} ${data?.error || ''}`);
  check('plán ready/processing', ['ready', 'processing'].includes(data?.plan_state), `plan_state=${data?.plan_state}`);
  return data;
}

async function login(page, label = 'login') {
  try {
    await page.goto(`${BASE_URL}/login?redirect=/profil`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button.login-submit').click();
    await page.waitForURL(/\/profil/, { timeout: 60_000 });
    await page.waitForSelector('#profile-today-heading, .profile-today-heading', { timeout: 120_000 });
  } catch (e) {
    await page.screenshot({ path: join(ARTIFACTS, `${PREFIX}-DEBUG-${label}.png`), fullPage: true }).catch(() => {});
    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.error(`[debug] url=${page.url()}`);
    console.error(`[debug] body: ${bodyText.slice(0, 900).replace(/\n+/g, ' | ')}`);
    throw e;
  }
}

async function dismissOverlays(page) {
  for (const sel of ['button:has-text("Zavřít")', 'button:has-text("Přeskočit")', 'button[aria-label="Zavřít"]']) {
    const b = page.locator(sel).first();
    if (await b.isVisible().catch(() => false)) await b.click({ force: true }).catch(() => {});
  }
  await page.keyboard.press('Escape').catch(() => {});
}

async function main() {
  await registerAccount();
  if (failed) throw new Error('Registration failed, aborting E2E');

  const browser = await chromium.launch();

  // ===== Desktop weekly UI =====
  const desktop = await browser.newPage({ viewport: { width: 1320, height: 900 } });
  await login(desktop);
  await desktop.waitForTimeout(1500);
  await dismissOverlays(desktop);
  await desktop.screenshot({ path: join(ARTIFACTS, `${PREFIX}-profile-desktop.png`), fullPage: false });

  check('today panel existuje', await desktop.locator('#profile-today-heading').count() > 0);
  check('dnešní jídla nahoře', await desktop.locator('#profile-today-meals .profile-today-meal-card').count() > 0);

  const expandWeek = desktop.locator('button:has-text("Rozbalit týden")').first();
  check('Rozbalit týden existuje', await expandWeek.count() > 0);
  await expandWeek.scrollIntoViewIfNeeded();
  await expandWeek.click({ force: true });
  await desktop.waitForTimeout(800);

  const dayCards = desktop.locator('.plan-day-card');
  const dayCount = await dayCards.count();
  check('týden má 7 dnů', dayCount === 7, `count=${dayCount}`);

  // Dnešní den: kompaktní
  const todayCard = desktop.locator('.plan-day-card.plan-day-today').first();
  const todayExpanded = await todayCard.evaluate((el) => el.classList.contains('plan-day-expanded')).catch(() => false);
  if (!todayExpanded) {
    await todayCard.locator('.plan-day-header-static').click({ force: true });
    await desktop.waitForTimeout(500);
  }
  check('dnešní den v týdnu kompaktní', await todayCard.locator('.plan-day-today-compact').count() > 0);
  check('dnešní den bez duplicitních meal karet', await todayCard.locator('.profile-today-meal-card, .plan-meal-card').count() === 0);

  // Jiný den: moderní UI
  let otherIdx = -1;
  for (let i = 0; i < dayCount; i += 1) {
    const isToday = await dayCards.nth(i).evaluate((el) => el.classList.contains('plan-day-today'));
    if (!isToday) { otherIdx = i; break; }
  }
  check('existuje jiný než dnešní den', otherIdx >= 0);
  const otherCard = dayCards.nth(otherIdx);
  await otherCard.locator('.plan-day-header-static').click({ force: true });
  await desktop.waitForTimeout(700);
  await otherCard.scrollIntoViewIfNeeded();
  await desktop.screenshot({ path: join(ARTIFACTS, `${PREFIX}-week-expanded.png`), fullPage: false });

  const modernCards = otherCard.locator('.plan-day-modern .profile-today-meal-card');
  const modernCount = await modernCards.count();
  check('jiný den má moderní meal karty', modernCount > 0, `count=${modernCount}`);
  check('jiný den nemá starý plan-meal-card layout', await otherCard.locator('.plan-meal-card').count() === 0);
  check('jiný den má CTA Recept', await otherCard.locator('button.profile-today-recipe-btn').count() > 0);
  check('jiný den má CTA Nahradit jiným', await otherCard.locator('button:has-text("Nahradit jiným")').count() > 0);
  check('jiný den má CTA Zahrnout od dalšího týdne', await otherCard.locator('button:has-text("Zahrnout od dalšího týdne")').count() > 0);
  const otherText = await otherCard.innerText();
  check('jiný den bez undefined/null/[object', !/undefined|\bnull\b|\[object/i.test(otherText));
  check('jiný den má kcal', /kcal/i.test(otherText));
  await otherCard.screenshot({ path: join(ARTIFACTS, `${PREFIX}-other-day-modern.png`) });

  // Recipe modal jiného dne — název jídla musí odpovídat kartě dne
  const firstTitle = (await modernCards.first().locator('.profile-today-meal-title').textContent() || '').trim();
  await otherCard.locator('button.profile-today-recipe-btn').first().click({ force: true });
  await desktop.waitForSelector('.plan-recipe-modal-body', { timeout: 30_000 });
  await desktop.waitForTimeout(1200);
  const modalText = await desktop.locator('.plan-recipe-modal').first().innerText().catch(() => '');
  check('recipe modal jiného dne se otevřel', modalText.length > 50);
  const titleCore = firstTitle.split('(')[0].trim().slice(0, 18);
  check('recipe modal odpovídá jídlu dne', titleCore.length === 0 || modalText.toLowerCase().includes(titleCore.toLowerCase()), `title="${firstTitle}"`);
  await desktop.screenshot({ path: join(ARTIFACTS, `${PREFIX}-recipe-modal.png`), fullPage: false });
  await desktop.locator('.plan-recipe-modal-close').first().click({ force: true }).catch(() => {});
  await desktop.waitForTimeout(400);

  // Swap jídla na jiném dni
  const titleBeforeSwap = (await otherCard.locator('.plan-day-modern .profile-today-meal-card').first().locator('.profile-today-meal-title').textContent() || '').trim();
  await otherCard.locator('button:has-text("Nahradit jiným")').first().click({ force: true });
  await desktop.waitForTimeout(9000);
  await desktop.keyboard.press('Escape').catch(() => {});
  await desktop.waitForTimeout(500);
  const titleAfterSwap = (await otherCard.locator('.plan-day-modern .profile-today-meal-card').first().locator('.profile-today-meal-title').textContent().catch(() => '') || '').trim();
  check('swap na jiném dni změnil jídlo', Boolean(titleAfterSwap) && titleAfterSwap !== titleBeforeSwap, `před="${titleBeforeSwap}" po="${titleAfterSwap}"`);

  // Pin na jiném dni
  await otherCard.locator('button:has-text("Zahrnout od dalšího týdne")').first().click({ force: true });
  await desktop.waitForTimeout(3000);
  check('pin na jiném dni funguje', await otherCard.locator('button:has-text("✓ Zahrnuto od dalšího týdne")').count() > 0);

  // ===== Birthdate v nastavení =====
  await dismissOverlays(desktop);
  const settingsBtn = desktop.locator('button.profile-quick-nav-btn', { hasText: 'Nastavení' }).first();
  await settingsBtn.scrollIntoViewIfNeeded();
  await settingsBtn.click({ force: true });
  await desktop.waitForSelector('input[type="date"]', { timeout: 25_000 });
  const birthValue = await desktop.locator('input[type="date"]').first().inputValue();
  check('nastavení zobrazuje zadané datum narození', birthValue === BIRTH_DATE, `value=${birthValue}`);
  const prefsText = await desktop.locator('body').innerText();
  const expAge = expectedAge(BIRTH_DATE);
  check(`věk odpovídá (${expAge})`, new RegExp(`Věk:\\s*${expAge}\\s*let`).test(prefsText), prefsText.match(/Věk:[^\n]*/)?.[0] || 'nenalezeno');
  check('nezobrazuje se fake 1. 1. default', !birthValue.endsWith('-01-01'));
  await desktop.screenshot({ path: join(ARTIFACTS, `${PREFIX}-birthdate-settings.png`), fullPage: false });

  // Edit + save + refresh
  await desktop.locator('input[type="date"]').first().fill(BIRTH_DATE_EDITED);
  const saveBtn = desktop.locator('button:has-text("Uložit změny")').first();
  const saveDisabled = await saveBtn.isDisabled().catch(() => false);
  check('Uložit změny není disabled', !saveDisabled);
  await saveBtn.click({ force: true });
  await desktop.waitForTimeout(8000);
  const errText = await desktop.locator('.prefs-error, [role="alert"]').first().innerText().catch(() => '');
  if (errText) console.log(`[debug] prefs error after save: ${errText}`);
  await desktop.goto(`${BASE_URL}/profil`, { waitUntil: 'networkidle', timeout: 60_000 });
  await desktop.waitForSelector('#profile-today-heading, .profile-today-heading', { timeout: 60_000 });
  await desktop.waitForTimeout(1200);
  await dismissOverlays(desktop);
  const settingsBtn2 = desktop.locator('button.profile-quick-nav-btn', { hasText: 'Nastavení' }).first();
  await settingsBtn2.scrollIntoViewIfNeeded();
  await settingsBtn2.click({ force: true });
  await desktop.waitForSelector('input[type="date"]', { timeout: 25_000 });
  const birthAfterRefresh = await desktop.locator('input[type="date"]').first().inputValue();
  check('po uložení a refreshi se datum drží', birthAfterRefresh === BIRTH_DATE_EDITED, `value=${birthAfterRefresh}`);
  await desktop.screenshot({ path: join(ARTIFACTS, `${PREFIX}-birthdate-after-refresh.png`), fullPage: false });
  await desktop.close();

  // ===== Mobile =====
  const mobile = await browser.newPage({ ...devices['iPhone 12'], viewport: { width: 390, height: 844 } });
  await login(mobile);
  await mobile.waitForTimeout(1500);
  await dismissOverlays(mobile);
  const hScroll = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  check('mobile bez horizontálního scrollu (profil)', !hScroll);
  const expandWeekM = mobile.locator('button:has-text("Rozbalit týden")').first();
  await expandWeekM.scrollIntoViewIfNeeded();
  await expandWeekM.click({ force: true });
  await mobile.waitForTimeout(800);
  const dayCardsM = mobile.locator('.plan-day-card');
  let otherIdxM = -1;
  const dayCountM = await dayCardsM.count();
  for (let i = 0; i < dayCountM; i += 1) {
    const isToday = await dayCardsM.nth(i).evaluate((el) => el.classList.contains('plan-day-today'));
    if (!isToday) { otherIdxM = i; break; }
  }
  await dayCardsM.nth(otherIdxM).locator('.plan-day-header-static').click({ force: true });
  await mobile.waitForTimeout(700);
  const hScroll2 = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  check('mobile bez horizontálního scrollu (rozbalený den)', !hScroll2);
  check('mobile: moderní karty v jiném dni', await dayCardsM.nth(otherIdxM).locator('.plan-day-modern .profile-today-meal-card').count() > 0);
  await dayCardsM.nth(otherIdxM).scrollIntoViewIfNeeded();
  await mobile.screenshot({ path: join(ARTIFACTS, `${PREFIX}-profile-mobile.png`), fullPage: false });
  await mobile.close();

  await browser.close();

  results.verdict = failed ? 'FAIL' : 'READY';
  console.log(`\n=== ${results.verdict} (${failed} failed) ===`);
  console.log(JSON.stringify({ email: TEST_EMAIL, birth_entered: BIRTH_DATE, birth_edited: BIRTH_DATE_EDITED }, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E ERROR:', e?.message);
  process.exit(1);
});
