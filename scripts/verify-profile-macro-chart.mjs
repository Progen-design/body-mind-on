#!/usr/bin/env node
/**
 * Statická kontrola makro grafů v profilu.
 *   node scripts/verify-profile-macro-chart.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getMacroCalorieDelta } from '../lib/macroKcalConsistency.js';

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

const macroChart = read('components/MacroRatioChart.js');
const todayPanels = read('components/profile/ProfileTodayPanels.js');
const planViewer = read('components/PlanViewer.js');
const packageJson = read('package.json');

check('MacroRatioChart komponenta existuje', macroChart.includes('export default function MacroRatioChart'));
check('stacked bar markup', macroChart.includes('macro-ratio-bar') && macroChart.includes('macro-ratio-seg'));
check('legenda maker', macroChart.includes('macro-ratio-legend'));
check('používá computeMacroRatio', macroChart.includes('computeMacroRatio'));
check('používá getMacroCalorieDelta', macroChart.includes('getMacroCalorieDelta'));
check('WARNING text zaokrouhlení', macroChart.includes('Kalorie jsou zaokrouhlené podle porcí'));
check('ERROR se neloguje uživateli v UI', !macroChart.includes('makra nesedí'));

check('meal card obsahuje MacroRatioChart', planViewer.includes('MacroRatioChart'));
check('today summary obsahuje denní MacroRatioChart', todayPanels.includes('MacroRatioChart'));

const example = getMacroCalorieDelta(945, 42, 112, 35);
check('945/42/112/35 = OK', example.status === 'OK', `status=${example.status}, delta=${example.deltaPercent}%`);

const warnKcal = getMacroCalorieDelta(1000, 30, 30, 70);
check('delta 8–15 % = WARNING', warnKcal.status === 'WARNING', `status=${warnKcal.status}, delta=${warnKcal.deltaPercent}%`);

const errKcal = getMacroCalorieDelta(1000, 5, 5, 5);
check('delta >15 % = ERROR', errKcal.status === 'ERROR', `status=${errKcal.status}, delta=${errKcal.deltaPercent}%`);

const badWidths = [
  ...(macroChart.match(/width:\s*(\d{4,})px/g) || []),
  ...(todayPanels.match(/width:\s*(\d{4,})px/g) || []),
].filter((w) => !w.includes('100'));
check('žádné fixed width nad 100vw v makro CSS', badWidths.length === 0, badWidths.join(', ') || 'none');
check('makro graf max-width 100%', macroChart.includes('max-width: 100%'));

check('npm script verify:profile-macro-chart', packageJson.includes('"verify:profile-macro-chart"'));

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
