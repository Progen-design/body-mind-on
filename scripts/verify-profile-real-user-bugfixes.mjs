#!/usr/bin/env node
/**
 * Ověření P1 profile real-user bugfix pack.
 *   node scripts/verify-profile-real-user-bugfixes.mjs
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

const profil = fs.readFileSync(path.join(root, 'pages/profil.js'), 'utf8');
const planViewer = fs.readFileSync(path.join(root, 'components/PlanViewer.js'), 'utf8');
const prefs = fs.readFileSync(path.join(root, 'components/profile/PreferencesOverlay.jsx'), 'utf8');
const planReplaceApi = fs.readFileSync(path.join(root, 'pages/api/plan-replace-meal.js'), 'utf8');
const planReplaceLib = fs.readFileSync(path.join(root, 'lib/planMealReplace.js'), 'utf8');
const exerciseInstructions = fs.readFileSync(path.join(root, 'lib/exerciseInstructions.js'), 'utf8');
const bodyBirth = fs.readFileSync(path.join(root, 'lib/bodyMetricsBirthDate.js'), 'utf8');
const profileBodyApi = fs.readFileSync(path.join(root, 'pages/api/profile-body-data.js'), 'utf8');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

console.log('--- A: profile navigation ---');
const navBlock = profil.match(/profile-quick-nav--plan-sections[\s\S]*?<\/nav>/)?.[0] || '';
const navTargets = [
  "getElementById('profile-today-heading')",
  "getElementById('profile-today-meals')",
  "getElementById('profile-today-workout')",
  "getElementById('plan-nakupni-seznam')",
  'openPreferencesWorkspace',
];
check('plan nav has distinct section targets', navTargets.every((t) => navBlock.includes(t)));
check('no duplicate Můj plán + Tréninkový plán to same anchor', !(
  profil.includes("Můj plán</button>") && profil.includes('Tréninkový plán</button>')
  && profil.match(/Můj plán[\s\S]{0,120}getElementById\('muj-plan'\)/)
  && profil.match(/Tréninkový plán[\s\S]{0,120}getElementById\('muj-plan'\)/)
));
check('todayFirstLayout hides legacy plan-nav', planViewer.includes('!todayFirstLayout') && planViewer.includes('plan-nav'));

console.log('\n--- B: local meal replacement ---');
check('PlanViewer uses plan-replace-meal API', planViewer.includes("'/api/plan-replace-meal'"));
check('PlanViewer sends day_slot_index', planViewer.includes('day_slot_index'));
check('today swap calls performMealSwap directly', planViewer.includes('performMealSwap'));
check('replace API uses local replaceMealInStructuredPlan', planReplaceApi.includes('replaceMealInStructuredPlan'));
check('replace API does not call Spoonacular/OpenAI', !planReplaceApi.match(/spoonacular|openai/i));
check('planMealReplace uses day slot index', planReplaceLib.includes('daySlotIndex'));
check('no rate-limit copy for NO_ALTERNATIVE', planReplaceApi.includes('Teď nemáme vhodnou náhradu'));

console.log('\n--- C: include next week feedback ---');
check('pin confirmation copy updated', planViewer.includes('Uloženo. Tohle jídlo budeme preferovat v dalších plánech.'));

console.log('\n--- D: exercise breathing/tempo ---');
check('exercise modal renders Dýchání', planViewer.includes('<strong>Dýchání:</strong>'));
check('exercise modal renders Tempo', planViewer.includes('<strong>Tempo:</strong>'));
for (const key of ['squat', 'lunges', 'pushup', 'plank', 'superman', 'glute_bridge', 'mountain_climber', 'plank_side', 'russian_twist']) {
  const block = exerciseInstructions.match(new RegExp(`${key}:\\s*\\{[\\s\\S]*?\\n\\s*\\},`));
  if (!block) { fail(`exercise guide missing ${key}`); continue; }
  const text = block[0];
  if (!text.includes('breathing:')) fail(`${key} missing breathing`);
  if (!text.includes('tempo:')) fail(`${key} missing tempo`);
}
ok('core exercises have breathing + tempo data');

console.log('\n--- E: single save CTA ---');
const ulozitCount = (prefs.match(/Uložit změny/g) || []).length;
const headerUlozit = prefs.includes("headerActions") && prefs.match(/headerActions[\s\S]*?Uložit/);
check('PreferencesOverlay has Uložit změny CTA', prefs.includes('Uložit změny'));
check('no duplicate header Uložit + footer Uložit změny', !headerUlozit && ulozitCount >= 1);

console.log('\n--- F: body data edit ---');
check('body metrics birth date helper', bodyBirth.includes('calculateAgeFromBirthDate'));
check('profile-body-data API exists', profileBodyApi.includes('birth_date'));
check('preferences form has weight field', prefs.includes('weight_kg'));
check('preferences form has height field', prefs.includes('height_cm'));
check('preferences form has birth_date field', prefs.includes('birth_date'));
check('age derived in overlay', prefs.includes('calculateAgeFromBirthDate'));
check('birth date hint copy', prefs.includes('Věk dopočítáme automaticky podle data narození'));
check('body save does not regen plan', profileBodyApi.includes('plan_regenerated: false'));

console.log('\n--- G: single-open day accordion ---');
check('accordion uses single Set slot', planViewer.includes('return new Set([di])'));
check('today default expanded via effect', planViewer.includes('setExpandedDayCards(new Set(ti >= 0 ? [ti] : [0]))'));
check('isDayExpanded only from expandedDayCards when todayFirst', planViewer.includes('expandedDayCards.has(di)'));

console.log('\n--- H: mobile UX ---');
check('first-action-banner hidden when plan exists', profil.includes('showReadyBanner && !currentPlan'));
check('profil page constrains overflow on mobile', profil.includes('overflow-x') || profil.includes('max-width: 100%'));
check('npm script verify:profile-real-user-bugfixes', packageJson.includes('"verify:profile-real-user-bugfixes"'));

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
