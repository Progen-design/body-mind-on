#!/usr/bin/env node
/**
 * Statická kontrola sekce programových variant na profilu.
 *   node scripts/verify-program-variants-section.mjs
 */
import { readFileSync } from 'fs';

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

const component = readFileSync(new URL('../components/ProgramVariantsSection.js', import.meta.url), 'utf8');
const profil = readFileSync(new URL('../pages/profil.js', import.meta.url), 'utf8');
const continuation = readFileSync(new URL('../components/ProgramContinuationPanel.js', import.meta.url), 'utf8');

const requiredStrings = [
  'START',
  'ON CLUB',
  'VIP PERFORMANCE',
  '12T TRANSFORMACE',
  '499',
  '1 499',
  '5 990',
  'TED',
  'komunit',
  '12 týdn',
  'Vyber si další krok',
  'Body &amp; Mind ON',
  'Vstoupit do ON CLUBU',
  'Mám zájem o VIP',
  'Chci 12T transformaci',
  'Pokračovat ve STARTU',
];

for (const token of requiredStrings) {
  const inComponent = component.toLowerCase().includes(token.toLowerCase());
  check(`komponenta obsahuje „${token}“`, inComponent, token);
}

check('profil importuje ProgramVariantsSection', profil.includes("import ProgramVariantsSection from '../components/ProgramVariantsSection'"));
check('profil renderuje ProgramVariantsSection', profil.includes('<ProgramVariantsSection'));
check('profil má anchor program-variants', component.includes('id="program-variants"'));
check('ON CLUB je featured', component.includes('featured: true') && component.includes("id: 'ON_CLUB'"));
check('continuation odkazuje na #program-variants', continuation.includes('href="#program-variants"'));
check('12T má badge Připravujeme', component.includes('Připravujeme'));
check('VIP CTA vede na /chci-vip', component.includes("href: '/chci-vip'"));
check('START CTA vede na /start', component.includes("href: '/start'"));
check('ON CLUB CTA vede na /on-club', component.includes("href: '/on-club'"));
check('mobilní grid 1 sloupec', component.includes('grid-template-columns: 1fr'));
check('CTA min-height 48px', component.includes('min-height: 48px'));
check('cena obsahuje 1499', /1\s*499/.test(component));
check('cena obsahuje 5990', /5\s*990/.test(component));

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
