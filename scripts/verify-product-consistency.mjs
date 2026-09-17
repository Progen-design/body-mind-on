#!/usr/bin/env node
/**
 * Produktová konzistence: VIP cena v lib/pricing.ts (autorita pro appku).
 *
 * PROMPT_UKLID.md (2026-09-17) — zbytek tohohle skriptu (index.js, register.js,
 * start.js, ProgramVariantsSection.js, TrialExpiredPaywall.js) mířil na
 * `_legacy-next/pages/*`, tedy na marketingovou landing page, která navíc
 * v tomhle repu nikdy nebyla živá appka — marketing web je samostatný
 * Vercel projekt `bodyandmindon-web` (viz CLAUDE.md), ne `src/`. Smazáno
 * v Bloku 1/2 spolu s `_legacy-next`; jediné, co tu mělo živý ekvivalent
 * (`lib/pricing.ts`), zůstává.
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
const pricing = read('lib/pricing.ts');
check('pricing.ts bez staré VIP ceny', !vipPricePattern.test(pricing));
check('pricing VIP label 5 990–6 990', /5\s*990.*6\s*990/.test(pricing));
check('pricing VIP_PRICE_LABEL export', pricing.includes('VIP_PRICE_LABEL'));

if (failed > 0) process.exit(1);
console.log('ALL CHECKS PASS');
