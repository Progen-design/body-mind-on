#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { filterWorkoutPlanForTrainingEnvironment, parseTrainingEnvironment, TRAINING_ENVIRONMENT_LABELS } from '../lib/trainingEnvironment.js';
import { getCanonicalExercise } from '../lib/exerciseCanonicalMap.js';
import { sessionTemplatesForBodyMetrics, workoutBlocksForBodyMetrics } from '../lib/workoutTemplates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let failed = 0;
function fail(msg) { console.log(`FAIL ${msg}`); failed += 1; }
function ok(msg) { console.log(`OK ${msg}`); }

const gymForbidden = ['squat', 'lunges', 'glute_bridge', 'mountain_climber', 'plank_side', 'russian_twist', 'pushup'];
const gymPreferred = ['leg_press', 'goblet_squat', 'chest_press', 'lat_pulldown', 'hip_thrust', 'hamstring_curl'];
const gymForbiddenPattern = /canonical_key:\s*'(squat|lunges|glute_bridge|mountain_climber|plank_side|russian_twist|pushup)'/;

console.log('--- gym strictness ---');
const gymPlan = {
  days: [{
    day_index: 1,
    exercises: gymForbidden.map((key) => ({ canonical_key: key, name_cs: key, sets: 3, reps: '10' })),
  }],
};
filterWorkoutPlanForTrainingEnvironment(gymPlan, { training_environment: 'gym', notes: 'Kde cvičí: Posilovna' });
const gymKeys = gymPlan.days[0].exercises.map((e) => e.canonical_key);
for (const f of gymForbidden) {
  if (gymKeys.includes(f)) fail(`gym plan still has ${f}`);
}
if (!gymKeys.some((k) => gymPreferred.includes(k))) fail('gym plan missing gym-first exercises');
else ok('gym replaces bodyweight with gym-first exercises');

const templatesSrc = fs.readFileSync(path.join(root, 'lib/workoutTemplates.js'), 'utf8');
const gymFallbackBlock = templatesSrc.split('export const GYM_FALLBACK_BLOCKS = Object.freeze([')[1]?.split(']);')[0] || '';
if (!gymFallbackBlock) fail('GYM_FALLBACK_BLOCKS missing');
if (gymForbiddenPattern.test(gymFallbackBlock)) fail('GYM_FALLBACK_BLOCKS contains forbidden bodyweight exercise');
if (!/canonical_key:\s*'leg_press'/.test(gymFallbackBlock)) fail('GYM_FALLBACK_BLOCKS should include leg_press');
else ok('deterministic gym fallback blocks are gym-first');

console.log('\n--- home_bodyweight ---');
const homePlan = {
  days: [{
    exercises: [
      { canonical_key: 'bench_press', name_cs: 'Bench' },
      { canonical_key: 'leg_press', name_cs: 'Leg press' },
      { canonical_key: 'lat_pulldown', name_cs: 'Lat' },
      { canonical_key: 'squat', name_cs: 'Dřepy' },
    ],
  }],
};
filterWorkoutPlanForTrainingEnvironment(homePlan, { training_environment: 'home_bodyweight', notes: 'Kde cvičí: Doma bez vybavení' });
const homeKeys = homePlan.days[0].exercises.map((e) => e.canonical_key);
for (const g of ['bench_press', 'leg_press', 'lat_pulldown']) {
  if (homeKeys.includes(g)) fail(`home_bodyweight still has gym-only ${g}`);
}
if (!homeKeys.includes('squat') && !homeKeys.includes('pushup')) fail('home_bodyweight should keep bodyweight exercise');
else ok('home_bodyweight removes gym-only exercises');

const pullUpHomePlan = {
  days: [{ exercises: [{ canonical_key: 'pull_up', name_cs: 'Shyby' }] }],
};
filterWorkoutPlanForTrainingEnvironment(pullUpHomePlan, {
  training_environment: 'home_bodyweight',
  notes: 'Kde cvičí: Doma bez vybavení',
});
if (pullUpHomePlan.days[0].exercises[0].canonical_key === 'pull_up') {
  fail('home_bodyweight must not keep pull_up without pullup_bar');
} else {
  ok('home_bodyweight replaces pull_up without hrazda');
}

console.log('\n--- home_equipment without gear ---');
const equipPlan = {
  days: [{
    exercises: [
      { canonical_key: 'bench_press', name_cs: 'Bench' },
      { canonical_key: 'bent_over_row', name_cs: 'Přítahy v předklonu' },
      { canonical_key: 'pull_up', name_cs: 'Shyby' },
    ],
  }],
};
filterWorkoutPlanForTrainingEnvironment(equipPlan, {
  training_environment: 'home_equipment',
  available_equipment: ['dumbbells'],
  notes: 'Kde cvičí: Doma s vybavením. Pomůcky: Jednoručky',
});
const eqExercises = equipPlan.days[0].exercises;
const eqKeys = eqExercises.map((e) => e.canonical_key);
if (eqKeys.includes('pull_up')) fail('pull_up without pullup_bar should be replaced');
else ok('home_equipment respects selected equipment');
if (eqKeys.includes('bench_press')) fail('bench_press without lavice should be replaced');
else ok('home_equipment replaces bench_press without lavice');
if (eqKeys.includes('bent_over_row')) fail('bent_over_row should take a dumbbell-row variant, not stay barbell');
else ok('home_equipment adapts bent_over_row to available equipment');

// Symptom měřený 29. 8.: "Nářadí: jednoručky, velká činka" i s equipment: ['dumbbells'].
// Barbell není mezi volbami v registraci — žádný cvik v home_equipment ho nesmí ukazovat.
const eqBarbell = eqExercises.filter((e) => getCanonicalExercise(e.canonical_key)?.equipment === 'barbell');
if (eqBarbell.length) fail(`home_equipment still shows barbell equipment: ${eqBarbell.map((e) => e.canonical_key).join(', ')}`);
else ok('home_equipment never claims equipment the user did not select (no barbell)');

const pullUpWithBarPlan = {
  days: [{ exercises: [{ canonical_key: 'pull_up', name_cs: 'Shyby' }] }],
};
filterWorkoutPlanForTrainingEnvironment(pullUpWithBarPlan, {
  training_environment: 'home_equipment',
  available_equipment: ['pullup_bar'],
  notes: 'Kde cvičí: Doma s vybavením. Pomůcky: Hrazda',
});
if (pullUpWithBarPlan.days[0].exercises[0].canonical_key !== 'pull_up') {
  fail('home_equipment with pullup_bar should keep pull_up');
} else {
  ok('home_equipment allows pull_up with hrazda');
}

console.log('\n--- home_equipment scaler templates ---');
const equipScalerMetrics = {
  training_environment: 'home_equipment',
  available_equipment: ['dumbbells', 'bench'],
};
const sessionTpl = sessionTemplatesForBodyMetrics(equipScalerMetrics);
const fallbackTpl = workoutBlocksForBodyMetrics(equipScalerMetrics);
const sessionKeys = new Set(sessionTpl.flat().map((e) => e.canonical_key));
const fallbackKeys = new Set(fallbackTpl.flat().map((e) => e.canonical_key));
if (!sessionKeys.has('bench_press') || !sessionKeys.has('bent_over_row')) {
  fail('sessionTemplatesForBodyMetrics should use equipment templates for dumbbells+bench');
} else ok('scaler session templates use home equipment blocks');
if (!fallbackKeys.has('bench_press')) fail('workoutBlocksForBodyMetrics should match equipment selection');
else ok('fallback blocks align with home equipment selection');

const bodyweightOnlyEquip = sessionTemplatesForBodyMetrics({
  training_environment: 'home_equipment',
  available_equipment: ['bands'],
});
const bwKeys = new Set(bodyweightOnlyEquip.flat().map((e) => e.canonical_key));
if (!bwKeys.has('squat') || bwKeys.has('leg_press')) {
  fail('home_equipment without dumbbells/bench should fall back to bodyweight session templates');
} else ok('home_equipment without dumbbells/bench uses bodyweight session fallback');

console.log('\n--- home_equipment dumbbells + bench (Út/Čt/So scenario) ---');
const homeDbBenchMetrics = {
  training_environment: 'home_equipment',
  available_equipment: ['dumbbells', 'bench'],
  notes: 'Kde cvičí: Doma s vybavením. Pomůcky: Jednoručky, Lavice',
  workout_days: '2,4,6',
  freq_choice: '2-3x týdně',
};
const scenarioPlan = {
  days: [{
    exercises: [
      { canonical_key: 'leg_press', name_cs: 'Leg press' },
      { canonical_key: 'lat_pulldown', name_cs: 'Lat pulldown' },
      { canonical_key: 'bench_press', name_cs: 'Bench' },
      { canonical_key: 'pull_up', name_cs: 'Shyby' },
      { canonical_key: 'tricep_extension', name_cs: 'TRX extension' },
      { canonical_key: 'hamstring_curl', name_cs: 'Zakopávání vleže' },
      { canonical_key: 'squat', name_cs: 'Dřepy' },
    ],
  }],
};
filterWorkoutPlanForTrainingEnvironment(scenarioPlan, homeDbBenchMetrics);
const scenarioKeys = scenarioPlan.days[0].exercises.map((e) => e.canonical_key);
const forbiddenHome = ['leg_press', 'lat_pulldown', 'pull_up', 'hamstring_curl'];
for (const f of forbiddenHome) {
  if (scenarioKeys.includes(f)) fail(`home_equipment dumbbells+bench still has ${f}`);
}
if (!scenarioKeys.some((k) => ['bench_press', 'dumbbell_bench_press', 'squat', 'overhead_press'].includes(k))) {
  fail('home_equipment dumbbells+bench should keep equipment-based lifts');
}
if (scenarioKeys.every((k) => ['squat', 'pushup', 'plank', 'lunges', 'glute_bridge'].includes(k))) {
  fail('home_equipment dumbbells+bench plan should not be bodyweight-only');
}
else ok('home_equipment dumbbells+bench removes machines and unselected gear');

const scenarioBarbell = scenarioPlan.days[0].exercises.filter((e) => getCanonicalExercise(e.canonical_key)?.equipment === 'barbell');
if (scenarioBarbell.length) fail(`home_equipment dumbbells+bench still shows barbell equipment: ${scenarioBarbell.map((e) => e.canonical_key).join(', ')}`);
else ok('home_equipment dumbbells+bench never claims barbell equipment');

const detEquip = templatesSrc.split('export const HOME_EQUIPMENT_DUMBBELL_BENCH_TEMPLATES = Object.freeze([')[1]?.split(']);')[0] || '';
if (!detEquip || !/dumbbell bench press/.test(detEquip)) fail('HOME_EQUIPMENT_DUMBBELL_BENCH_BLOCKS missing dumbbell exercises');
else ok('deterministic home equipment blocks use dumbbells/bench');

// PROMPT_UKLID.md (2026-09-17) — `_legacy-next/pages/start.js`, `on-club.js`,
// `chci-vip.js` a `_legacy-next/components/profile/PreferencesOverlay.jsx`
// smazány v Bloku 1. Registrace je dnes JEDNA komponenta pro všechny tiery
// (`src/components/registrace/StartRegistrace.tsx`, App.tsx ji renderuje pro
// celé `CESTY_REGISTRACE` — /start, /register, /signup), ne tři oddělené
// stránky — proto tu není smyčka přes tři soubory, jen jedna kontrola.
const startSrc = fs.readFileSync(path.join(root, 'src/components/registrace/StartRegistrace.tsx'), 'utf8');
if (!startSrc.includes('training_environment') || !startSrc.includes('available_equipment')) {
  fail('StartRegistrace missing training environment / equipment fields');
} else ok('registration form has training environment + equipment fields (shared across all tiers)');
// Klient `available_equipment` při přepnutí pryč z home_equipment NEMAŽE
// (zjištěno při přepisu — `zmen()` je obecný setter). Měřený symptom z 29. 8.
// (stará hláška "Nářadí: jednoručky, velká činka" i s equipment: ['dumbbells'])
// zůstává krytý na serveru — viz "body-metrics API ignores equipment outside
// home_equipment" níž, který používá živé api/body-metrics.js beze změny.

const prefsModal = fs.readFileSync(path.join(root, 'src/components/PreferencesModal.tsx'), 'utf8');
const profilePrefsApi = fs.readFileSync(path.join(root, 'api/profile-preferences.js'), 'utf8');
if (!prefsModal.includes('training_environment') || !prefsModal.includes('available_equipment')) {
  fail('PreferencesModal missing training environment in Nastavení');
} else ok('PreferencesModal has training environment settings');
if (!profilePrefsApi.includes('mergeTrainingEnvironmentIntoNotes')) {
  fail('profile-preferences API should persist training environment into notes');
} else ok('profile-preferences API saves training environment');

const bodyMetricsApi = fs.readFileSync(path.join(root, 'api/body-metrics.js'), 'utf8');
const bodyMetricsRegistration = fs.readFileSync(path.join(root, 'lib/registration/bodyMetricsRegistration.js'), 'utf8');
const bodyMetricsRegistrationChain = `${bodyMetricsApi}\n${bodyMetricsRegistration}`;
if (!bodyMetricsRegistrationChain.includes("trainingEnvironment === 'home_equipment'")) {
  fail('body-metrics API should only persist equipment for home_equipment');
} else ok('body-metrics API ignores equipment outside home_equipment');

console.log('\n--- profile / structured labels ---');
// PROMPT_UKLID.md (2026-09-17) — `_legacy-next/pages/profil.js` a
// `.../PlanViewer.js` smazány v Bloku 1. `planOrchestrator.js` pořád vyrábí
// `training_environment_label` do `structured_plan_json` (server žije), ale
// ověřeno greppem přes celé src/: ŽÁDNÁ komponenta ho nečte ani nezobrazuje
// jako odznak ("Posilovna" apod.) — server data má, UI je nikde nekreslí.
// Gap se nevymýšlí, jen se pinuje a hlásí v reportu k PROMPT_UKLID.md.
const orchestrator = fs.readFileSync(path.join(root, 'lib/services/planOrchestrator.js'), 'utf8');
if (!orchestrator.includes('training_environment_label')) fail('planOrchestrator missing structured training label');

const srcDir = path.join(root, 'src');
const srcFiles = [];
(function projdi(d) {
  for (const jmeno of fs.readdirSync(d)) {
    const p = path.join(d, jmeno);
    if (fs.statSync(p).isDirectory()) projdi(p);
    else if (/\.(tsx?|jsx?)$/.test(jmeno) && !/\.test\./.test(jmeno)) srcFiles.push(p);
  }
})(srcDir);
const rendersEnvLabel = srcFiles.some((p) => /training_environment_label/.test(fs.readFileSync(p, 'utf8')));
if (rendersEnvLabel) {
  ok('GAP closed: some src/ component now renders training_environment_label — update this check to point at it');
} else {
  ok('GAP: training_environment_label exists server-side, no src/ component renders it as a badge (pinned, not invented)');
}
const env = parseTrainingEnvironment({ notes: 'Kde cvičí: Posilovna' });
if (env !== 'gym' || TRAINING_ENVIRONMENT_LABELS[env] !== 'Posilovna') fail('parseTrainingEnvironment gym label');
const homeBw = parseTrainingEnvironment({ notes: 'Kde cvičí: Doma bez vybavení' });
if (homeBw !== 'home_bodyweight') fail(`parseTrainingEnvironment home_bodyweight from notes got ${homeBw}`);
if (TRAINING_ENVIRONMENT_LABELS[homeBw] !== 'Doma bez vybavení') fail('home_bodyweight label mismatch');
else ok('training environment label pipeline present');

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
