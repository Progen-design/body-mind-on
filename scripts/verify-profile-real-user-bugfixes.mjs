#!/usr/bin/env node
/**
 * Ověření P1 profile real-user bugfix pack — živá lib/api vrstva.
 *   node scripts/verify-profile-real-user-bugfixes.mjs
 *
 * PROMPT_UKLID.md (2026-09-17) — původní skript mířil hlavně na
 * `_legacy-next/pages/profil.js`, `.../PlanViewer.js` a
 * `.../PreferencesOverlay.jsx` (smazané v Bloku 1): navigace, accordion
 * stav, konkrétní JSX handler jména (performMealSwap, performOpenExercise…)
 * a texty formuláře preferencí, které v `src/` nemají odpovídající
 * ekvivalent (appka je záložková, ne accordion nad jedním PlanViewerem —
 * ověřeno greppem, 0 zásahů). Zůstává, co mířilo na živé `api/`/`lib/`
 * soubory. Přenosová (dýchání/tempo) data existují a testují se; jejich
 * VYKRESLENÍ ve WorkoutSection.tsx neexistuje — pinováno jako GAP.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let failed = 0;
function fail(msg) { console.log(`FAIL ${msg}`); failed += 1; }
function ok(msg) { console.log(`OK ${msg}`); }
function check(label, cond) { if (cond) ok(label); else fail(label); }

const planReplaceApi = fs.readFileSync(path.join(root, 'api/plan-replace-meal.js'), 'utf8');
const planReplaceLib = fs.readFileSync(path.join(root, 'lib/planMealReplace.js'), 'utf8');
const exerciseInstructions = fs.readFileSync(path.join(root, 'lib/exerciseInstructions.js'), 'utf8');
const bodyBirth = fs.readFileSync(path.join(root, 'lib/bodyMetricsBirthDate.js'), 'utf8');
const profileBodyApi = fs.readFileSync(path.join(root, 'api/profile-body-data.js'), 'utf8');
const workoutSection = fs.readFileSync(path.join(root, 'src/components/WorkoutSection.tsx'), 'utf8');

console.log('--- local meal replacement ---');
check('replace API uses local replaceMealInStructuredPlan', planReplaceApi.includes('replaceMealInStructuredPlan'));
check('replace API does not call Spoonacular/OpenAI', !planReplaceApi.match(/spoonacular|openai/i));
check('planMealReplace uses day slot index', planReplaceLib.includes('daySlotIndex'));
check('no rate-limit copy for NO_ALTERNATIVE', planReplaceApi.includes('Teď nemáme vhodnou náhradu'));

console.log('\n--- exercise breathing/tempo data ---');
for (const key of ['squat', 'lunges', 'pushup', 'plank', 'superman', 'glute_bridge', 'mountain_climber', 'plank_side', 'russian_twist']) {
  const block = exerciseInstructions.match(new RegExp(`${key}:\\s*\\{[\\s\\S]*?\\n\\s*\\},`));
  if (!block) { fail(`exercise guide missing ${key}`); continue; }
  const text = block[0];
  if (!text.includes('breathing:')) fail(`${key} missing breathing`);
  if (!text.includes('tempo:')) fail(`${key} missing tempo`);
}
ok('core exercises have breathing + tempo data');
check('GAP: WorkoutSection nevykresluje dýchání ani tempo (data existují, UI je nemá)', !/Dýchání|Tempo:/.test(workoutSection));

console.log('\n--- body data edit ---');
check('body metrics birth date helper', bodyBirth.includes('calculateAgeFromBirthDate'));
check('profile-body-data API exists', profileBodyApi.includes('birth_date'));
check('body save does not regen plan', profileBodyApi.includes('plan_regenerated: false'));

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
