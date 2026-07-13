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
const upsell = readFileSync(new URL('../components/ProfileContinuationUpsell.js', import.meta.url), 'utf8');

const requiredStrings = [
  'START',
  'ON CLUB',
  'VIP PERFORMANCE',
  '12T TRANSFORMACE',
  'START_VARIANT_PRICE_LABEL',
  'ON_CLUB_VARIANT_PRICE_LABEL',
  'VIP_PRICE_LABEL',
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

check('profil neimportuje ProgramVariantsSection', !profil.includes("import ProgramVariantsSection from '../components/ProgramVariantsSection'"));
check('profil nerenderuje ProgramVariantsSection', !profil.includes('<ProgramVariantsSection'));
check('komponenta má anchor program-variants', component.includes('id="program-variants"'));
check('ON CLUB je featured', component.includes('featured: true') && component.includes("id: 'ON_CLUB'"));
check('profil má kompaktní upsell', profil.includes('ProfileContinuationUpsell') && profil.includes('Chceš pokračovat dál?'));
check('upsell odkazuje na /on-club', upsell.includes('href="/on-club"'));
check('12T má badge Připravujeme', component.includes('Připravujeme'));
check('VIP CTA vede na /chci-vip', component.includes("href: '/chci-vip'"));
check('START CTA vede na /start', component.includes("href: '/start'"));
check('ON CLUB CTA vede na /on-club', component.includes("href: '/on-club'"));
check('mobilní grid 1 sloupec', component.includes('grid-template-columns: 1fr'));
check('CTA min-height 48px', component.includes('min-height: 48px'));
check('cena START z pricing.ts (599)', component.includes('START_VARIANT_PRICE_LABEL'));
check('cena ON CLUB z pricing.ts', component.includes('ON_CLUB_VARIANT_PRICE_LABEL'));
check('cena VIP z pricing.ts', component.includes('VIP_PRICE_LABEL'));

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
