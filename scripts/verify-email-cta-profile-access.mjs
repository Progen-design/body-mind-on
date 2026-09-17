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

// PROMPT_UKLID.md (2026-09-17) — `_legacy-next/pages/{login,profil,start,
// register}.js` smazány v Bloku 1; `middleware.js` (Next.js) už vůbec
// neexistuje — nahradilo ho `middleware.ts` (Vercel Routing Middleware), ale
// to řeší JINOU věc (marketing vs. app host), ne login-redirect.
//
// Architektura auth guardu se v SPA úplně proměnila: stránkové
// `router.replace('/login?redirect=/profil')` na více místech nahradilo
// jedno klientské větvení v `src/App.tsx` — `if (!isAuthenticated)` (řádek
// 943) vyrenderuje login inline, žádný druhý URL redirect pro už přihlášené
// neexistuje (viz i komentář v lib/__tests__/planEmailCta.test.mjs).
// Bezpečné `?redirect=` už hlídá `bezpecnyRedirect()` — otestováno zvlášť
// v src/routing.test.ts a lib/__tests__/planEmailCta.test.mjs, tady by šlo
// jen o duplicitu nebo o kontrolu textů/souborů, co v SPA nemají obdobu.
check('bezpecnyRedirect a auth guard mají vlastní pokrytí jinde (routing.test.ts, planEmailCta.test.mjs)', true);

if (failed > 0) process.exit(1);
console.log('ALL CHECKS PASS');
