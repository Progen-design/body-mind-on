#!/usr/bin/env node
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
const TAG = process.argv[2] || 'prod';

const admin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

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
if (otpErr) throw otpErr;

const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', '').split('.')[0];
const storageKey = `sb-${ref}-auth-token`;
const ARTIFACTS = join(ROOT, 'artifacts');
mkdirSync(ARTIFACTS, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(({ storageKey, sessionPayload }) => {
  localStorage.setItem(storageKey, JSON.stringify(sessionPayload));
}, { storageKey, sessionPayload: otpData.session });
await page.goto(`${BASE}/profil`, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(8000);

// Profil může být v bublině Plán – otevři ji, pokud je Dnes skrytý.
const planBubble = page.locator('#profile-bubble-header-plan, [id*="bubble-header-plan"]').first();
if (await planBubble.count()) {
  try { await planBubble.click({ timeout: 3000 }); await page.waitForTimeout(1500); } catch { /* ignore */ }
}

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
await page.waitForTimeout(1000);

const habitTitle = page.locator('h2.ht-title').filter({ hasText: 'Denní návyky' }).first();
if (await habitTitle.count()) await habitTitle.scrollIntoViewIfNeeded();
await page.waitForTimeout(1000);

const metrics = { base: BASE, tag: TAG };

const nums = page.locator('.habit-ui-progress-nums').first();
const sep = page.locator('.habit-ui-progress-sep').first();
if (await nums.count()) {
  metrics.habitsText = (await nums.innerText()).replace(/\s+/g, ' ').trim();
  metrics.habitsHtml = await nums.evaluate((el) => el.innerHTML);
  if (await sep.count()) {
    metrics.habitsSep = await sep.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, text: el.textContent, opacity: s.opacity };
    });
  }
  await nums.screenshot({ path: join(ARTIFACTS, `blok1-habits-progress-${TAG}.png`) });
}

const todayNums = page.locator('.beta-today-section .habit-ui-progress-nums').first();
if (await todayNums.count()) {
  metrics.todayText = (await todayNums.innerText()).replace(/\s+/g, ' ').trim();
  metrics.todayHtml = await todayNums.evaluate((el) => el.innerHTML);
  await todayNums.screenshot({ path: join(ARTIFACTS, `blok1-today-progress-${TAG}.png`) });
} else {
  metrics.todayText = null;
  metrics.todayNote = 'Panel Dnes nenalezen nebo bez progress baru';
}

writeFileSync(join(ARTIFACTS, `blok1-${TAG}-metrics.json`), JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
await page.screenshot({ path: join(ARTIFACTS, `blok1-full-${TAG}.png`), fullPage: true });
const bodySnippet = (await page.locator('body').innerText()).slice(0, 800);
writeFileSync(join(ARTIFACTS, `blok1-${TAG}-body.txt`), bodySnippet);
await browser.close();
