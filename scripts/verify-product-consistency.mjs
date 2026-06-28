#!/usr/bin/env node
/**
 * Produktová konzistence: VIP cena, CTA, START local meals guard.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

const vipPricePattern = /3\s*999\s*Kč|priceCzk:\s*3999|"3999"/;

const filesToScan = [
  'pages/index.js',
  'components/TrialExpiredPaywall.js',
  'lib/pricing.ts',
  'components/ProgramVariantsSection.js',
  'pages/register.js',
  'pages/start.js',
];

for (const file of filesToScan) {
  const text = read(file);
  check(`${file} bez staré VIP ceny`, !vipPricePattern.test(text));
}

const pricing = read('lib/pricing.ts');
check('pricing VIP label 5 990–6 990', /5\s*990.*6\s*990/.test(pricing));
check('pricing VIP_PRICE_LABEL export', pricing.includes('VIP_PRICE_LABEL'));

const index = read('pages/index.js');
check('index ON CLUB CTA → /on-club', index.includes('`${APP_URL}/on-club`'));
check('index VIP CTA → /chci-vip', index.includes('`${APP_URL}/chci-vip`'));
check('index nemá start?plan=club', !index.includes('start?plan=club'));
check('index nemá start?plan=vip', !index.includes('start?plan=vip'));

const register = read('pages/register.js');
check('register redirect club → /on-club', register.includes("plan === 'club'") && register.includes("router.replace('/on-club')"));
check('register redirect vip → /chci-vip', register.includes("plan === 'vip'") && register.includes("router.replace('/chci-vip')"));

const start = read('pages/start.js');
check('start redirect club → /on-club', start.includes("plan === 'club'") && start.includes("router.replace('/on-club')"));
check('start redirect vip → /chci-vip', start.includes("plan === 'vip'") && start.includes("router.replace('/chci-vip')"));

const variants = read('components/ProgramVariantsSection.js');
check('ProgramVariants VIP cena', variants.includes('5 990 – 6 990 Kč / měsíc'));
check('ProgramVariants ON CLUB featured', variants.includes('featured: true'));

if (failed > 0) process.exit(1);
console.log('ALL CHECKS PASS');
