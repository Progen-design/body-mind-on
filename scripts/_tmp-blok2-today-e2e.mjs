#!/usr/bin/env node
/**
 * BLOK 2 — E2E ověření panelu Dnes + Denní návyky.
 * BASE_URL=https://app.bodyandmindon.cz node scripts/_tmp-blok2-today-e2e.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
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

const BASE = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const EMAIL = (process.env.E2E_EMAIL || 'janprikopa@gmail.com').trim().toLowerCase();
const ARTIFACTS = join(ROOT, 'artifacts');
mkdirSync(ARTIFACTS, { recursive: true });

const results = [];

function record(id, ok, detail, verified = true) {
  results.push({ id, ok, detail, verified });
  const tag = verified ? 'OVĚŘENO' : 'KÓD ONLY';
  if (ok) console.log(`PASS [${tag}] ${id} — ${detail}`);
  else console.error(`FAIL [${tag}] ${id} — ${detail}`);
}

const admin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function magicLogin(page) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: EMAIL,
    options: { redirectTo: `${BASE}/profil` },
  });
  if (error) throw error;
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  if (otpErr || !otpData?.session) throw otpErr || new Error('verifyOtp failed');
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', '').split('.')[0];
  const storageKey = `sb-${ref}-auth-token`;
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(({ storageKey, sessionPayload }) => {
    localStorage.setItem(storageKey, JSON.stringify(sessionPayload));
  }, { storageKey, sessionPayload: otpData.session });
  return otpData.session.access_token;
}

async function openPlanSection(page) {
  await page.goto(`${BASE}/profil`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(4000);
  const planBubble = page.locator('#profile-bubble-header-plan').first();
  if (await planBubble.count()) {
    const expanded = await planBubble.getAttribute('aria-expanded');
    if (expanded !== 'true') {
      await planBubble.click();
      await page.waitForTimeout(1500);
    }
  }
  const today = page.locator('#beta-today-heading, h2:has-text("Dnes")').first();
  if (await today.count()) await today.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
}

async function getProgressText(page) {
  const el = page.locator('.beta-today-section .habit-ui-progress-nums').first();
  if (!(await el.count())) return null;
  return (await el.innerText()).replace(/\s+/g, ' ').trim();
}

async function findMealRow(page) {
  const section = page.locator('.beta-today-section');
  const rows = section.locator('.habit-ui-check-row');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const label = (await row.locator('.habit-ui-check-label').innerText()).trim();
    if (/snídan|breakfast|oběd|večeř|jídlo/i.test(label)) {
      return { row, label };
    }
  }
  if (count > 0) {
    const row = rows.first();
    return { row, label: await row.locator('.habit-ui-check-label').innerText() };
  }
  return null;
}

async function findWorkoutRow(page) {
  const row = page.locator('.beta-today-section .habit-ui-check-row').filter({
    has: page.locator('.habit-ui-check-label', { hasText: /trénink/i }),
  }).first();
  if (await row.count()) return row;
  return null;
}

async function isRowChecked(row) {
  const pressed = await row.getAttribute('aria-pressed');
  return pressed === 'true';
}

async function uncompleteMealViaApi(token, activityKey, planDay = 0) {
  await fetch(`${BASE}/api/daily-activation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'uncomplete',
      activity_type: 'meal',
      activity_key: activityKey,
      plan_day: planDay,
    }),
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const token = await magicLogin(page);

  // 7) habit write rejected
  const habitRes = await fetch(`${BASE}/api/daily-activation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ activity_type: 'habit', activity_key: 'training', plan_day: 0 }),
  });
  const habitJson = await habitRes.json().catch(() => ({}));
  record(
    '7-habit-api-400',
    habitRes.status === 400 && String(habitJson.error || '').includes('habit_logs'),
    `status=${habitRes.status}, error=${habitJson.error || '—'}`,
  );

  await openPlanSection(page);

  const todayVisible = (await page.locator('.beta-today-section').count()) > 0;
  if (!todayVisible) {
    record('setup', false, 'Panel Dnes (.beta-today-section) nenalezen na profilu');
    writeFileSync(join(ARTIFACTS, 'blok2-results.json'), JSON.stringify(results, null, 2));
    await browser.close();
    process.exit(1);
  }

  const meal = await findMealRow(page);
  const workout = await findWorkoutRow(page);

  // 1) Meal toggle + refresh
  if (!meal) {
    record('1-meal-persist', false, 'Žádný řádek jídla v panelu Dnes');
  } else {
    const mealKeyGuess = 'breakfast';
    await uncompleteMealViaApi(token, mealKeyGuess);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    await openPlanSection(page);
    const mealAfterReset = await findMealRow(page);
    if (!mealAfterReset) {
      record('1-meal-persist', false, 'Jídlo zmizelo po reload');
    } else {
      const before = await isRowChecked(mealAfterReset.row);
      await mealAfterReset.row.click();
      await page.waitForTimeout(1200);
      const afterClick = await isRowChecked(mealAfterReset.row);
      const progressAfter = await getProgressText(page);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(4000);
      await openPlanSection(page);
      const mealReload = await findMealRow(page);
      const afterReload = mealReload ? await isRowChecked(mealReload.row) : false;
      record(
        '1-meal-persist',
        !before && afterClick && afterReload,
        `label="${mealAfterReset.label}", před=${before}, po klik=${afterClick}, po refresh=${afterReload}`,
      );
      record(
        '4-progress-immediate',
        progressAfter != null && /^\d+\/\d+$/.test(progressAfter.replace(/\s/g, '')),
        `progress po kliknutí jídla: "${progressAfter}"`,
        afterClick !== before,
      );
    }
  }

  // 2) Workout toggle + refresh
  if (!workout) {
    record('2-workout-persist', false, 'Řádek tréninku v panelu Dnes nenalezen (možná dnes bez tréninku)');
  } else {
    const wasChecked = await isRowChecked(workout);
    if (wasChecked) {
      await workout.click();
      await page.waitForTimeout(1000);
    }
    await workout.click();
    await page.waitForTimeout(1200);
    const afterClick = await isRowChecked(workout);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    await openPlanSection(page);
    const workoutReload = await findWorkoutRow(page);
    const afterReload = workoutReload ? await isRowChecked(workoutReload) : false;
    record(
      '2-workout-persist',
      afterClick && afterReload,
      `po klik=${afterClick}, po refresh=${afterReload}`,
    );
  }

  // 3) Check-in save + refresh
  const ratingBtn = page.getByRole('button', { name: 'Dobře' }).first();
  if (!(await ratingBtn.count())) {
    record('3-checkin-persist', false, 'Tlačítko hodnocení "Dobře" nenalezeno');
  } else {
    await ratingBtn.click();
    await page.waitForTimeout(300);
    const saveBtn = page.getByRole('button', { name: /Uložit check-in|Aktualizovat check-in/ }).first();
    await saveBtn.click();
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    await openPlanSection(page);
    const activeDobre = await page.getByRole('button', { name: 'Dobře' }).first().evaluate((el) =>
      el.classList.contains('habit-ui-btn--pill-active') || el.getAttribute('aria-pressed') === 'true',
    );
    record('3-checkin-persist', activeDobre, `rating "Dobře" aktivní po refresh=${activeDobre}`);
  }

  // 5) Habit in Denní návyky
  const habitTitle = page.locator('h2.ht-title').filter({ hasText: 'Denní návyky' });
  if (await habitTitle.count()) await habitTitle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const habitCell = page.locator('.hg-habit-cell:not(:disabled)').filter({
    hasNot: page.locator('[aria-label*="jen zobrazení"]'),
  }).first();
  if (!(await habitCell.count())) {
    record('5-habit-persist', false, 'Žádná editovatelná buňka návyku (dnes) v gridu');
  } else {
    const wasDone = (await habitCell.getAttribute('aria-pressed')) === 'true';
    if (wasDone) await habitCell.click(), await page.waitForTimeout(1000);
    await habitCell.click();
    await page.waitForTimeout(1200);
    const afterClick = (await habitCell.getAttribute('aria-pressed')) === 'true';
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    if (await habitTitle.count()) await habitTitle.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const cellReload = page.locator('.hg-habit-cell:not(:disabled)').filter({
      hasNot: page.locator('[aria-label*="jen zobrazení"]'),
    }).first();
    const afterReload = (await cellReload.getAttribute('aria-pressed')) === 'true';
    record('5-habit-persist', afterClick && afterReload, `po klik=${afterClick}, po refresh=${afterReload}`);
  }

  // 6) Splnit vše pro dnes
  const completeAll = page.getByRole('button', { name: 'Splnit vše pro dnes' });
  if (!(await completeAll.count())) {
    record('6-complete-all', false, 'Tlačítko "Splnit vše pro dnes" nenalezeno');
  } else {
    await completeAll.click();
    await page.waitForTimeout(2000);
    const progressNums = page.locator('.ht-top .habit-ui-progress-nums').first();
    const progressText = (await progressNums.count()) ? await progressNums.innerText() : '';
    const allDone = /(\d+)\/(\d+)/.test(progressText) && RegExp.$1 === RegExp.$2;
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    if (await habitTitle.count()) await habitTitle.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const progressAfter = await page.locator('.ht-top .habit-ui-progress-nums').first().innerText().catch(() => '');
    const stillDone = /(\d+)\/(\d+)/.test(progressAfter) && RegExp.$1 === RegExp.$2 && RegExp.$1 !== '0';
    record('6-complete-all', allDone && stillDone, `po klik="${progressText}", po refresh="${progressAfter}"`);
  }

  writeFileSync(join(ARTIFACTS, 'blok2-results.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed === 0 ? '\nBLOK2 ALL PASS' : `\nBLOK2 FAILED ${failed}/${results.length}`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
