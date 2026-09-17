#!/usr/bin/env node
/**
 * Statická kontrola: recipe modal má suroviny a postup.
 *
 * PROMPT_UKLID.md (2026-09-17) — zbytek tohohle skriptu mířil na
 * `_legacy-next/pages/profil.js` a tři komponenty pod
 * `_legacy-next/components/profile/*` — celý "today-first accordion" layout
 * (kompaktní dnešek + rozbalitelný týden v jednom PlanViewer), který živá
 * appka nemá: `src/` je záložková navigace (NavigationTabs.tsx), ne
 * accordion nad jedním velkým plánem. Žádný živý ekvivalent pro accordion-
 * specifické kontroly (todayFirstLayout, plan-day-today-compact, weeklyPlanOpen
 * atd.) neexistuje. Jediná kontrola, co mířila na živý soubor
 * (lib/mealRecipeDisplay.js), zůstává.
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

check('mealRecipeDisplay má suroviny a postup', read('lib/mealRecipeDisplay.js').includes('ingredients_cs') && read('lib/mealRecipeDisplay.js').includes('instructions_cs'));

if (failed > 0) process.exit(1);
console.log('ALL CHECKS PASS');
