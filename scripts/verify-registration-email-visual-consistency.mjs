#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { buildWeeklyPlanEmailV8Document } from '../lib/weeklyPlanEmailV8.js';
import { buildPlanEmailPlainText } from '../lib/emailTemplates.js';
import { getPlanEmailCtaUrl } from '../lib/siteUrls.js';

const ROOT = process.cwd();
const ARTIFACTS = join(ROOT, 'artifacts');
mkdirSync(ARTIFACTS, { recursive: true });

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
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

function buildSamplePlan() {
  const days = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
  return {
    valid_from: '2026-07-06',
    valid_until: '2026-07-12',
    goal: 'udrzovani',
    targets: { calories_per_day: 2200, protein_g: 150, carbs_g: 220, fat_g: 70 },
    days: days.map((day, idx) => ({
      day_name: day,
      date: `2026-07-${String(6 + idx).padStart(2, '0')}`,
      meals: [
        {
          type: 'breakfast',
          display_name_cs: `Snídaně ${idx + 1}`,
          kcal: 500 + idx * 5,
          protein_g: 30,
          carbs_g: 45,
          fat_g: 16,
          ingredient_lines: ['Vejce', 'Pečivo', 'Zelenina'],
        },
        {
          type: 'lunch',
          display_name_cs: `Oběd ${idx + 1}`,
          kcal: 700 + idx * 6,
          protein_g: 48,
          carbs_g: 70,
          fat_g: 20,
          ingredient_lines: ['Kuře', 'Rýže', 'Zelenina'],
        },
        {
          type: 'dinner',
          display_name_cs: `Večeře ${idx + 1}`,
          kcal: 620 + idx * 4,
          protein_g: 40,
          carbs_g: 50,
          fat_g: 18,
          ingredient_lines: ['Ryba', 'Brambory', 'Salát'],
        },
      ],
      workout: idx % 2 === 0
        ? {
            intensity: idx === 0 ? 'hard' : 'medium',
            exercises: [
              { name: 'Dřepy', sets: 4, reps: 10 },
              { name: 'Výpady', sets: 3, reps: '10 per leg' },
              { name: 'Prkno', sets: 3, duration_seconds: 45 },
            ],
          }
        : null,
    })),
  };
}

function previewShell({ title, bodyHtml, widthPx }) {
  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;background:#0a1018;padding:16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="margin:0 auto;max-width:${widthPx}px;width:100%;">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

async function maybeCreateScreenshots(desktopHtmlPath, mobileHtmlPath) {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 2000 } });
    await page.goto(`file:///${desktopHtmlPath.replace(/\\/g, '/')}`);
    await page.screenshot({ path: join(ARTIFACTS, 'email-registration-preview-desktop.png'), fullPage: true });

    const pageMobile = await browser.newPage({ viewport: { width: 390, height: 2200 } });
    await pageMobile.goto(`file:///${mobileHtmlPath.replace(/\\/g, '/')}`);
    await pageMobile.screenshot({ path: join(ARTIFACTS, 'email-registration-preview-mobile.png'), fullPage: true });
    await browser.close();
    return true;
  } catch (err) {
    console.warn('[verify-registration-email] screenshot skipped:', err?.message || err);
    return false;
  }
}

const structuredPlan = buildSamplePlan();
const bodyMetrics = { name: 'Jan', goal: 'udrzovani', height_cm: 180, weight_kg: 82 };
const rawPlanHtml = '<h3>Jídelníček</h3><p><b>Snídaně:</b> Ovesná kaše</p><p><b>Trénink tento den:</b></p><ul><li>Dřepy 3×10</li></ul>';
const html = buildWeeklyPlanEmailV8Document({
  structuredPlanJson: structuredPlan,
  bodyMetrics,
  firstName: 'Jan',
  validFrom: structuredPlan.valid_from,
});
const plainText = buildPlanEmailPlainText({
  firstName: 'Jan',
  planChangeContext: false,
  ctaUrl: getPlanEmailCtaUrl(),
  loginUrl: getPlanEmailCtaUrl(),
  safePlanHtml: rawPlanHtml,
});

const previewPath = join(ARTIFACTS, 'email-registration-preview.html');
const gmailDesktopPath = join(ARTIFACTS, 'email-registration-gmail-desktop.html');
const gmailMobilePath = join(ARTIFACTS, 'email-registration-gmail-mobile.html');
const outlookSafePath = join(ARTIFACTS, 'email-registration-outlook-safe.html');
const textPreviewPath = join(ARTIFACTS, 'email-registration-preview.txt');

writeFileSync(previewPath, html, 'utf8');
writeFileSync(gmailDesktopPath, previewShell({ title: 'Gmail Desktop Preview', bodyHtml: html, widthPx: 640 }), 'utf8');
writeFileSync(gmailMobilePath, previewShell({ title: 'Gmail Mobile Preview', bodyHtml: html, widthPx: 390 }), 'utf8');
writeFileSync(outlookSafePath, html, 'utf8');
writeFileSync(textPreviewPath, plainText, 'utf8');

console.log('--- Content checks ---');
check('obsahuje Body & Mind ON', /Body\s*&amp;\s*Mind\s*ON|BODY\s*&amp;\s*MIND\s*ON/i.test(html));
check('obsahuje Tvůj plán je připravený', /Tvůj plán je připravený/i.test(html));
check('obsahuje CTA Otevřít můj profil', /Otevřít můj profil/i.test(html));
check('CTA vede na /login\\?redirect=/profil', /\/login\?redirect=\/profil/.test(html));
check('obsahuje dnešní sekci', /Dnešní den/i.test(html));
check('obsahuje týdenní přehled', /Zbytek týdne v kostce/i.test(html));
check('obsahuje bezpečnostní poznámku', /Plán je orientační a nenahrazuje doporučení lékaře/i.test(html));

console.log('--- Security checks ---');
check('neobsahuje access token', !/access_token/i.test(html));
check('neobsahuje refresh token', !/refresh_token/i.test(html));
check('neobsahuje service role key', !/service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(html));
check('neobsahuje raw JSON payload', !/"targets"\s*:|structured_plan_json|user_context/i.test(html));
check('neobsahuje user_id', !/user_id/i.test(html));
check('neobsahuje Withings tokeny', !/withings.*token|access_token_withings|refresh_token_withings/i.test(html));

console.log('--- Compatibility checks ---');
check('bez <script>', !/<script\b/i.test(html));
check('bez externího CSS', !/<link[^>]+stylesheet/i.test(html));
check('bez CSS grid', !/display\s*:\s*grid/i.test(html));
check('bez position fixed', !/position\s*:\s*fixed/i.test(html));
check('bez sticky', !/position\s*:\s*sticky/i.test(html));
check('bez backdrop-filter', !/backdrop-filter/i.test(html));
check('table-based layout', /<table\b/i.test(html));
check('inline CSS existuje', /style="/i.test(html));
check('max width 640', /max-width:\s*640px/.test(html));
check('mobile width 100%', /width:\s*100%/.test(html));
check('žádný horizontální overflow 390 preview', !/overflow-x:\s*auto|min-width:\s*7\d{2,}px/i.test(read('artifacts/email-registration-gmail-mobile.html')));

console.log('--- Localization checks ---');
check('bez "per leg"', !/\bper leg\b/i.test(html));
check('bez "each leg"', !/\beach leg\b/i.test(html));
check('používá "na každou nohu"', /na každou nohu/i.test(html));

console.log('--- Source consistency checks ---');
const mailJs = read('lib/mail.js');
const resendApi = read('pages/api/send-plan-again.js');
const weeklyV8 = read('lib/weeklyPlanEmailV8.js');
check('structured_plan_json used when exists', /!canUseStructuredPlan/.test(mailJs) && /structuredPlanJson/.test(mailJs));
check('today email source aligned', /buildStructuredWeekSource/.test(weeklyV8) && /todayWeekIdx/.test(weeklyV8));
check('weekly email source aligned', /planWeekDays/.test(weeklyV8) && /_placeholder/.test(weeklyV8));
check('stale html fallback prevented for resend', /renderPlanHtmlFromStructured/.test(resendApi));
check('email has 7 days', structuredPlan.days.length === 7);

const screenshotsOk = await maybeCreateScreenshots(gmailDesktopPath, gmailMobilePath);
check('desktop preview artifact', read('artifacts/email-registration-gmail-desktop.html').length > 500);
check('mobile preview artifact', read('artifacts/email-registration-gmail-mobile.html').length > 500);
check('outlook-safe artifact', read('artifacts/email-registration-outlook-safe.html').length > 500);
if (screenshotsOk) {
  check('desktop screenshot created', true);
  check('mobile screenshot created', true);
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);

