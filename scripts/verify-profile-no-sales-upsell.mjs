#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
let failed = 0;

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

const profil = read('pages/profil.js');
const planViewer = read('components/PlanViewer.js');
const todayPanels = read('components/profile/ProfileTodayPanels.js');
const variants = read('components/ProgramVariantsSection.js');

const bannedProfileTexts = [
  'Vyber si další krok',
  'Pokračovat ve STARTU',
  'START 499 Kč',
  'ON CLUB 1 499 Kč',
];

check('pages/profil.js neimportuje ProfileContinuationUpsell', !/import\s+ProfileContinuationUpsell/.test(profil));
check('profil nerenderuje ProfileContinuationUpsell', !/<ProfileContinuationUpsell/.test(profil));
check('PlanViewer nescrolluje na profile-continuation-upsell', !/profile-continuation-upsell/.test(planViewer));
check('ProfileTodayPanels nerenderuje sales CTA kartu', !/Jak pokračovat po STARTU|Možnosti programu|Další krok/.test(todayPanels));
check('profil neobsahuje ProgramVariantsSection', !/ProgramVariantsSection/.test(profil));

for (const phrase of bannedProfileTexts) {
  check(`profil neobsahuje text "${phrase}"`, !profil.includes(phrase) && !todayPanels.includes(phrase) && !planViewer.includes(phrase));
}

check('sales blok zůstává mimo profil', /Vyber si další krok[\s\S]{0,40}Body\s*&amp;\s*Mind ON/.test(variants));

if (failed > 0) {
  console.error(`\n${failed} CHECK(S) FAILED`);
  process.exit(1);
}

console.log('\nALL CHECKS PASS');
