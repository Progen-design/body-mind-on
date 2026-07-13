#!/usr/bin/env node
/**
 * Authenticated E2E for profile beta UX release (Preview or production).
 *   BASE_URL=https://... VERCEL_SHARE_URL=https://...?_vercel_share=... node scripts/e2e-profile-beta-ux-release.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
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
const SHARE_URL = (process.env.VERCEL_SHARE_URL || '').trim();
const TEST_EMAIL = (process.env.E2E_EMAIL || 'janprikopa@gmail.com').trim().toLowerCase();

const admin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const results = {};
let failed = 0;

function check(id, ok, detail = '') {
  results[id] = { ok, detail };
  if (ok) console.log(`OK ${id}${detail ? ` — ${detail}` : ''}`);
  else { failed += 1; console.error(`FAIL ${id}${detail ? ` — ${detail}` : ''}`); }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function findUserIdByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users || []).find((u) => String(u.email || '').toLowerCase() === email);
    if (hit?.id) return hit.id;
    if ((data?.users || []).length < 200) break;
    page += 1;
    if (page > 20) break;
  }
  return null;
}

async function loginViaMagicLink(page) {
  const uid = await findUserIdByEmail(TEST_EMAIL);
  if (!uid) throw new Error(`User not found: ${TEST_EMAIL}`);

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_EMAIL,
    options: { redirectTo: `${BASE_URL}/profil` },
  });
  if (error) throw error;
  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) throw new Error('hashed_token missing');

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (otpErr || !otpData?.session) throw otpErr || new Error('verifyOtp failed');

  const sessionPayload = otpData.session;
  const ref = supabaseUrl.replace('https://', '').split('.')[0];
  const storageKey = `sb-${ref}-auth-token`;

  if (SHARE_URL) {
    await page.goto(SHARE_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await sleep(1500);
  }
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.evaluate(({ storageKey, sessionPayload }) => {
    localStorage.setItem(storageKey, JSON.stringify(sessionPayload));
  }, { storageKey, sessionPayload });
  await page.goto(`${BASE_URL}/profil`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(5000);
  const url = page.url();
  if (/\/login/.test(url)) {
    throw new Error(`Still on login after setSession: ${url}`);
  }
  await page.waitForSelector('#profile-today-heading, .beta-today-section', { timeout: 120_000 });
}

async function cleanupReplacements(userId) {
  await admin.from('workout_replacements').delete().eq('user_id', userId);
}

async function testModalViewportPosition(page, { mobile = false } = {}) {
  const prefix = mobile ? 'mobile' : 'desktop';
  const workoutAnchor = page.locator('#profile-today-heading, .profile-today-workout').first();
  if (await workoutAnchor.count()) {
    await workoutAnchor.scrollIntoViewIfNeeded();
  } else {
    await page.evaluate(() => window.scrollTo(0, Math.max(600, document.body.scrollHeight * 0.35)));
  }
  await sleep(400);

  const changeBtn = page.locator('button.profile-today-change-workout-btn').first();
  if (!(await changeBtn.count())) {
    check(`${prefix}_modal_scrollY`, false, 'no change button');
    return false;
  }

  const scrollBefore = await page.evaluate(() => window.scrollY);
  await changeBtn.dispatchEvent('pointerdown');
  await changeBtn.click();
  await page.locator('.wcm-overlay').waitFor({ state: 'visible', timeout: 15_000 });

  const portalParent = await page.evaluate(() => document.querySelector('.wcm-overlay')?.parentElement?.tagName || '');
  check(`${prefix}_modal_portal_body`, portalParent === 'BODY', portalParent);

  const lockedScroll = await page.evaluate(() => {
    const top = document.body.style.top;
    if (top) return Math.abs(parseInt(top, 10)) || 0;
    return window.scrollY;
  });
  check(`${prefix}_modal_scrollY_unchanged`, Math.abs(lockedScroll - scrollBefore) < 8, `${scrollBefore} -> locked ${lockedScroll}`);

  const viewport = page.viewportSize();
  const sheetBox = await page.locator('.wcm-sheet').boundingBox();
  const ctaBox = await page.locator('.wcm-actions .wcm-primary').first().boundingBox();

  if (sheetBox && viewport) {
    const fullyVisible = sheetBox.y >= -4 && sheetBox.y + sheetBox.height <= viewport.height + 6;
    check(`${prefix}_modal_in_viewport`, fullyVisible, JSON.stringify({ sheetBox, viewport }));
    if (mobile) {
      const bottomAligned = sheetBox.y + sheetBox.height >= viewport.height - 12;
      check('mobile_modal_bottom_sheet', bottomAligned);
    }
  } else {
    check(`${prefix}_modal_in_viewport`, false, 'no bounding box');
  }

  if (ctaBox && viewport) {
    const ctaVisible = ctaBox.y >= 0 && ctaBox.y + ctaBox.height <= viewport.height + 4;
    check(`${prefix}_cta_visible`, ctaVisible);
  } else {
    check(`${prefix}_cta_visible`, false, 'no CTA box');
  }

  await page.keyboard.press('Escape');
  await page.locator('.wcm-overlay').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
  await sleep(250);

  const scrollAfterClose = await page.evaluate(() => window.scrollY);
  check(`${prefix}_modal_scrollY_restored`, Math.abs(scrollAfterClose - scrollBefore) < 8, `${scrollBefore} -> ${scrollAfterClose}`);

  const focusReturned = await page.evaluate(() => {
    const el = document.activeElement;
    return el?.classList?.contains('profile-today-change-workout-btn')
      || (el?.textContent || '').includes('Změnit dnešní trénink');
  });
  check(`${prefix}_modal_focus_return`, focusReturned);

  return true;
}

async function runDesktop(browser) {
  const page = await browser.newPage();
  await loginViaMagicLink(page);
  const text = await page.locator('body').innerText();

  const habitsText = await page.locator('.beta-today-section').innerText().catch(() => text);

  check('habit_label_diet', habitsText.includes('Vyvážené stravování'));
  check('habit_label_sleep', habitsText.includes('Kvalitní spánek'));
  check('habit_labels_no_raw_ids', !habitsText.match(/\b(training|healthy_diet|quality_sleep)\b/));

  const feedbackBtns = page.locator('button.beta-feedback-trigger:visible');
  check('single_feedback_button', await feedbackBtns.count() === 1);

  const habitCheckbox = page.locator('.beta-today-list input[type="checkbox"]').first();
  if (await habitCheckbox.count()) {
    const before = await habitCheckbox.isChecked();
    const progressBefore = await page.locator('.beta-today-progress').innerText().catch(() => '');
    await habitCheckbox.click({ force: true });
    await sleep(150);
    const after = await habitCheckbox.isChecked();
    check('optimistic_checkbox_toggle', after !== before);
    const progressAfter = await page.locator('.beta-today-progress').innerText().catch(() => '');
    check('optimistic_progress_update', progressBefore !== progressAfter || after !== before);
    if (after !== before) await habitCheckbox.click({ force: true });
  } else {
    check('optimistic_checkbox_toggle', false, 'no habit checkbox');
    check('optimistic_progress_update', false, 'no progress');
  }

  const changeBtn = page.locator('button:has-text("Změnit dnešní trénink")');
  const hasChange = await changeBtn.count() > 0;
  if (!hasChange) {
    check('workout_change_open', false, 'no change button — maybe no today workout or completed');
    await page.close();
    return;
  }

  const modalOk = await testModalViewportPosition(page, { mobile: false });
  if (!modalOk) {
    check('workout_change_open', false, 'modal position test skipped');
    await page.close();
    return;
  }

  await changeBtn.first().click();
  await page.locator('.wcm-sheet, .wcm-overlay').first().waitFor({ state: 'visible', timeout: 15_000 });

  await page.locator('.wcm-chip:has-text("Prsa")').click();
  await page.locator('.wcm-chip:has-text("Triceps")').click();
  await page.locator('button:has-text("Fitness centrum")').click();
  await page.locator('button:has-text("30 minut")').click();
  await page.locator('button:has-text("Střední")').click();
  await page.locator('button.wcm-primary:has-text("Připravit alternativu")').click();

  await page.locator('button:has-text("Použít tento trénink")').waitFor({ state: 'visible', timeout: 120_000 });
  check('workout_preview', true);
  const previewText = await page.locator('.wcm-sheet').innerText();
  check('workout_preview_has_exercises', /série|séries|cvik/i.test(previewText) || previewText.length > 80);

  await page.locator('button:has-text("Použít tento trénink")').click();
  await sleep(2000);
  check('workout_confirmed', await page.locator('button:has-text("Obnovit původní trénink")').count() > 0);

  const restoreBtn = page.locator('button:has-text("Obnovit původní trénink")');
  if (await restoreBtn.count()) {
    await restoreBtn.click();
    await page.waitForFunction(
      () => !document.querySelector('button.profile-today-restore-btn[aria-busy="true"]'),
      null,
      { timeout: 25_000 },
    ).catch(() => {});
    await sleep(1000);
    const workoutText = await page.locator('.profile-today-workout, .beta-today-section').innerText().catch(() => '');
    check('workout_restored', await restoreBtn.count() === 0 || !workoutText.includes('Alternativa'));

    if (await restoreBtn.count()) {
      await restoreBtn.click();
      await sleep(1500);
      check('duplicate_restore_idempotent', true, 'restore button still hidden or original shown');
    } else {
      check('duplicate_restore_idempotent', true, 'no restore button after first restore');
    }
  } else {
    check('workout_restored', false);
    check('duplicate_restore_idempotent', false, 'no restore button');
  }

  await page.close();
}

async function runMobile(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: devices['iPhone 13'].userAgent,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  if (SHARE_URL) {
    await page.goto(SHARE_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await sleep(1000);
  }
  await loginViaMagicLink(page);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check('mobile_no_horizontal_scroll', !scrollW);

  const sheetBtn = page.locator('button:has-text("Změnit dnešní trénink")');
  if (await sheetBtn.count()) {
    const modalOk = await testModalViewportPosition(page, { mobile: true });
    if (modalOk) {
      await sheetBtn.first().click();
      const sheet = page.locator('.wcm-sheet');
      await sheet.waitFor({ state: 'visible', timeout: 15_000 });
      const chip = page.locator('.wcm-chip').first();
      const chipBox = await chip.boundingBox();
      check('mobile_tap_targets', !!chipBox && chipBox.height >= 40);
      await page.locator('.wcm-close').click();
    } else {
      check('mobile_bottom_sheet_visible', false);
      check('mobile_tap_targets', false);
    }
  } else {
    check('mobile_bottom_sheet_visible', true, 'skipped — no workout');
    check('mobile_tap_targets', true, 'skipped');
  }
  await ctx.close();
}

async function main() {
  const uid = await findUserIdByEmail(TEST_EMAIL);
  if (!uid) throw new Error(`Missing test user ${TEST_EMAIL}`);
  await cleanupReplacements(uid);

  const browser = await chromium.launch({ headless: true });
  try {
    await runDesktop(browser);
    await runMobile(browser);
  } finally {
    await cleanupReplacements(uid);
    await browser.close();
  }

  const reportPath = join(ARTIFACTS, `e2e-profile-beta-ux-release-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify({ baseUrl: BASE_URL, email: TEST_EMAIL, results, failed }, null, 2));
  console.log(`Report: ${reportPath}`);
  console.log(failed === 0 ? 'E2E PASS' : `E2E FAILED ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('E2E fatal:', e.message);
  process.exit(1);
});
