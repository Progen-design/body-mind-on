#!/usr/bin/env node
/**
 * Ověření CTA v plan e-mailu a přístupového flow profil/login/start.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildWeeklyPlanEmailV8Document } from '../lib/weeklyPlanEmailV8.js';
import { buildPlanEmailDocument } from '../lib/emailTemplates.js';
import {
  getDefaultLoginUrl,
  getPlanEmailCtaUrl,
  getLoginRedirectToProfileUrl,
} from '../lib/siteUrls.js';

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
  return readFileSync(resolve(process.cwd(), relPath), 'utf8');
}

function extractHrefUrls(html) {
  const urls = [];
  const re = /href="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

const samplePlan = {
  days: [
    {
      day_name: 'Pondělí',
      date: '2026-06-30',
      meals: [{ type: 'lunch', display_name_cs: 'Kuře s rýží', kcal: 600 }],
      workout: { exercises: [{ name: 'Dřepy', reps: '3×12' }] },
    },
  ],
  targets: { calories_per_day: 2200, protein_g: 140, carbs_g: 200, fat_g: 70 },
};

const v8Html = buildWeeklyPlanEmailV8Document({
  structuredPlanJson: samplePlan,
  bodyMetrics: { name: 'Jan', goal: 'udrzovani' },
  firstName: 'Jan',
  appBaseUrl: 'https://app.bodyandmindon.cz',
});

const legacyHtml = buildPlanEmailDocument({
  safePlanHtml: '<div class="plan-day"><h2>Pondělí</h2></div>',
  loginUrl: getDefaultLoginUrl(),
  appBaseUrl: 'https://app.bodyandmindon.cz',
  firstName: 'Jan',
});

for (const [label, html] of [['v8', v8Html], ['legacy', legacyHtml]]) {
  const hrefs = extractHrefUrls(html);
  const badReg = hrefs.filter((u) => /\/start\b|\/register\b|\/registrace\b/i.test(u));
  check(`${label} e-mail bez CTA na registraci`, badReg.length === 0, badReg.join(', ') || 'none');
  const hasGoodCta = hrefs.some((u) => /\/profil\b/i.test(u) || /\/login\?redirect=%2Fprofil|\/login\?redirect=\/profil/i.test(u));
  check(`${label} e-mail má profil/login redirect CTA`, hasGoodCta);
}

const planCta = getPlanEmailCtaUrl();
check('getPlanEmailCtaUrl obsahuje login?redirect=/profil', /\/login\?redirect=.*profil/i.test(planCta), planCta);
check('getDefaultLoginUrl === login redirect profil', getDefaultLoginUrl() === getLoginRedirectToProfileUrl());

const loginJs = read('pages/login.js');
check('login default redirect /profil', loginJs.includes(": '/profil'"));
check('login plan access headline', loginJs.includes('Přihlas se a otevři svůj plán'));
check('login plan access text', loginJs.includes('Tvůj plán už je připravený'));

const profilJs = read('pages/profil.js');
check('profil auth redirect s query', profilJs.includes("router.replace('/login?redirect=/profil')"));

const startJs = read('pages/start.js');
check('start session guard → profil', startJs.includes("router.replace('/profil')") && startJs.includes('getSession'));
check('start login hint', startJs.includes('Přihlas se a otevři svůj plán'));
check('start login link redirect', startJs.includes('/login?redirect=/profil'));

const registerJs = read('pages/register.js');
check('register session guard → profil', registerJs.includes("router.replace('/profil')"));
check('register bez plan → login', registerJs.includes("router.replace('/login?redirect=/profil')"));

const middlewareJs = read('middleware.js');
check('middleware / → login redirect', middlewareJs.includes("new URL('/login?redirect=/profil'"));
check('middleware / nevede na /start', !middlewareJs.includes("new URL('/start'"));

if (failed > 0) process.exit(1);
console.log('ALL CHECKS PASS');
