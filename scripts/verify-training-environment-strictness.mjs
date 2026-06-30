#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { filterWorkoutPlanForTrainingEnvironment, parseTrainingEnvironment, TRAINING_ENVIRONMENT_LABELS } from '../lib/trainingEnvironment.js';

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

const detSrc = fs.readFileSync(path.join(root, 'lib/services/deterministicFallback.js'), 'utf8');
const gymFallbackBlock = detSrc.split('const GYM_WORKOUT_BLOCKS = [')[1]?.split('];')[0] || '';
if (!gymFallbackBlock) fail('GYM_WORKOUT_BLOCKS missing');
if (gymForbiddenPattern.test(gymFallbackBlock)) fail('GYM_WORKOUT_BLOCKS contains forbidden bodyweight exercise');
if (!/canonical_key:\s*'leg_press'/.test(gymFallbackBlock)) fail('GYM_WORKOUT_BLOCKS should include leg_press');
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

console.log('\n--- home_equipment without gear ---');
const equipPlan = {
  days: [{ exercises: [{ canonical_key: 'bench_press', name_cs: 'Bench' }, { canonical_key: 'pull_up', name_cs: 'Shyby' }] }],
};
filterWorkoutPlanForTrainingEnvironment(equipPlan, {
  training_environment: 'home_equipment',
  available_equipment: ['dumbbells'],
  notes: 'Kde cvičí: Doma s vybavením. Pomůcky: Jednoručky',
});
const eqKeys = equipPlan.days[0].exercises.map((e) => e.canonical_key);
if (eqKeys.includes('pull_up')) fail('pull_up without pullup_bar should be replaced');
else ok('home_equipment respects selected equipment');

console.log('\n--- profile / structured labels ---');
const profil = fs.readFileSync(path.join(root, 'pages/profil.js'), 'utf8');
const planViewer = fs.readFileSync(path.join(root, 'components/PlanViewer.js'), 'utf8');
const orchestrator = fs.readFileSync(path.join(root, 'lib/services/planOrchestrator.js'), 'utf8');
if (!profil.includes('trainingEnvironmentLabelFromMetrics')) fail('profil missing training environment label helper');
if (!planViewer.includes('plan-badge-env')) fail('PlanViewer missing training environment badge');
if (!orchestrator.includes('training_environment_label')) fail('planOrchestrator missing structured training label');
const env = parseTrainingEnvironment({ notes: 'Kde cvičí: Posilovna' });
if (env !== 'gym' || TRAINING_ENVIRONMENT_LABELS[env] !== 'Posilovna') fail('parseTrainingEnvironment gym label');
const homeBw = parseTrainingEnvironment({ notes: 'Kde cvičí: Doma bez vybavení' });
if (homeBw !== 'home_bodyweight') fail(`parseTrainingEnvironment home_bodyweight from notes got ${homeBw}`);
if (TRAINING_ENVIRONMENT_LABELS[homeBw] !== 'Doma bez vybavení') fail('home_bodyweight label mismatch');
else ok('training environment label pipeline present');

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
