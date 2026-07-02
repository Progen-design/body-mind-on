#!/usr/bin/env node
/**
 * Ověření vizuální konzistence e-mailu s profilem.
 *   npm run verify:email-visual-consistency
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildWeeklyPlanEmailV8Document } from '../lib/weeklyPlanEmailV8.js';
import { BM_ON_DESIGN, EMAIL_CONTAINER_MAX_PX } from '../lib/designTokens.js';
import { getPlanEmailCtaUrl } from '../lib/siteUrls.js';

const ROOT = process.cwd();
const ARTIFACTS = join(ROOT, 'artifacts');

let failed = 0;

function htmlWithoutHrefAttrs(html) {
  return String(html || '').replace(/href="[^"]*"/gi, '');
}

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

const samplePlan = {
  days: [
    {
      day_name: 'Pondělí',
      date: '2026-07-01',
      meals: [
        { type: 'breakfast', display_name_cs: 'Ovesná kaše s proteinem', kcal: 520, protein_g: 32, carbs_g: 58, fat_g: 14 },
        { type: 'lunch', display_name_cs: 'Kuře s rýží', kcal: 640, protein_g: 48, carbs_g: 62, fat_g: 16 },
      ],
      workout: { exercises: [{ name: 'Dřepy', reps: '3×12' }] },
    },
    { day_name: 'Úterý', date: '2026-07-02', meals: [{ type: 'lunch', display_name_cs: 'Salát s tuňákem', kcal: 480 }], workout: null },
  ],
  targets: { calories_per_day: 2200, protein_g: 140, carbs_g: 200, fat_g: 70 },
};

const html = buildWeeklyPlanEmailV8Document({
  structuredPlanJson: samplePlan,
  bodyMetrics: { name: 'Jan', goal: 'udrzovani', height_cm: 180, weight_kg: 82 },
  firstName: 'Jan',
  appBaseUrl: 'https://app.bodyandmindon.cz',
});

mkdirSync(ARTIFACTS, { recursive: true });
writeFileSync(join(ARTIFACTS, 'weekly-plan-email-preview.html'), html, 'utf8');

console.log('--- Static email visual checks ---');
check('designTokens.js exists', read('lib/designTokens.js').includes('BM_ON_DESIGN'));
check('email max width 640', EMAIL_CONTAINER_MAX_PX === 640);
check('email HTML max-width 640', html.includes('max-width:640px'));
check('email header Body & Mind ON', /BODY\s*&amp;\s*MIND\s*ON|BODY & MIND ON/i.test(html));
check('email hero připravený', /Tvůj plán je připravený/i.test(html));
check('email dark page bg', html.includes(BM_ON_DESIGN.colors.bg) || html.includes('#0A1018'));
check('email dark card bg', html.includes(BM_ON_DESIGN.colors.cardBg) || html.includes('#121826'));
check('email CTA Otevřít můj profil', /Otevřít můj profil/i.test(html));
check('email CTA login redirect profil', /\/login\?redirect=.*profil/i.test(html));
check('email bez hlavního CTA /start', !/href="[^"]*\/start"/i.test(html));
check('email makro štítky kcal', /kcal/i.test(html));
check('email makro bílkoviny', /bílkovin|BÍLKOVINY/i.test(html));
check('email makro sacharidy', /sacharid|SACHARID/i.test(html));
check('email makro tuky', /tuk|TUK/i.test(html));
check('email bez protein_g v HTML', !/protein_g|carbs_g|fat_g/i.test(htmlWithoutHrefAttrs(html)));
check('email bez ON Club fluff', !/člen ON Club/i.test(html));
check('email bez technické verze v patičce', !/v8\.0/i.test(html));
check('email bez activity debug', !/Aktivita:/i.test(html));
check('email preview artifact', read('artifacts/weekly-plan-email-preview.html').length > 500);

const planCta = getPlanEmailCtaUrl();
check('getPlanEmailCtaUrl login profil', /\/login\?redirect=.*profil/i.test(planCta), planCta);

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
