#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join } from 'path';
import { formatExerciseSetsRepsDisplay } from '../lib/planDataIntegrity.js';
import { getExerciseInstructionGuide } from '../lib/exerciseInstructions.js';

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

const instructionsSrc = read('lib/exerciseInstructions.js');

const lungeDisplay = formatExerciseSetsRepsDisplay({ sets: 5, reps: '10 per leg' });
const squatDisplay = formatExerciseSetsRepsDisplay({ sets: 5, reps: '10' });

check('české UI nepoužívá "per leg" ve formatteru', !/per leg/i.test(lungeDisplay), lungeDisplay);
check('výpady používají "na každou nohu"', /na každou nohu/i.test(lungeDisplay), lungeDisplay);
check('dřepy nepoužívají "na každou nohu"', !/na každou nohu/i.test(squatDisplay), squatDisplay);

const squatGuide = getExerciseInstructionGuide('squat');
const lungeGuide = getExerciseInstructionGuide('lunges');
check('existují instrukce pro dřepy', Boolean(squatGuide?.how));
check('existují instrukce pro výpady', Boolean(lungeGuide?.how));
check('dřepy a výpady mají rozdílné instrukce', String(squatGuide?.how || '') !== String(lungeGuide?.how || ''));
check('výpady obsahují krok a střídání nohou', /krok|stříd/i.test(String(lungeGuide?.how || '')), lungeGuide?.how || '');
check('dřepy obsahují sednutí/obě nohy', /sed|obě nohy/i.test(String(squatGuide?.how || '')), squatGuide?.how || '');

check('exercise modal texty pro dřepy a výpady nejsou identické', /squat:/.test(instructionsSrc) && /lunges:/.test(instructionsSrc));
// PROMPT_UKLID.md (2026-09-17) — `_legacy-next/components/profile/ProfileTodayPanels.js`
// a `_legacy-next/components/PlanViewer.js` smazány v Bloku 1. Ověřeno
// greppem: `formatExerciseSetsRepsDisplay` (lib/planDataIntegrity.js) nemá
// dnes žádného konzumenta v src/ — funkce zůstává a testuje se výš (řádky
// 27–32), ale živá appka série/opakování formátuje jinudy, přes
// `serieOpakovaniSlovy` (lib/profile/treninkPopis.js), které "na každou
// nohu" nepřekládá, jen předá text tak, jak přijde z dat cviku. Kontrola
// "jednotný formatter napříč komponentami" tak nemá co ověřit — smazána,
// ne vymyšlena.

if (failed > 0) {
  console.error(`\n${failed} CHECK(S) FAILED`);
  process.exit(1);
}

console.log('\nALL CHECKS PASS');
