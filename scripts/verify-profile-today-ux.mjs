#!/usr/bin/env node
/**
 * Statická kontrola today-first UX profilu.
 *   node scripts/verify-profile-today-ux.mjs
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

const profil = read('pages/profil.js');
const planViewer = read('components/PlanViewer.js');
const todayPanels = read('components/profile/ProfileTodayPanels.js');
const packageJson = read('package.json');

check('profil importuje ProfileTodayPanels přes PlanViewer', planViewer.includes("import ProfileTodayPanels from './profile/ProfileTodayPanels'"));
check('PlanViewer má prop todayFirstLayout', planViewer.includes('todayFirstLayout'));
check('profil předává todayFirstLayout', profil.includes('todayFirstLayout'));
check('profil předává program do PlanViewer', profil.includes('program={program}'));
check('profil předává trainingEnvironmentLabel', profil.includes('trainingEnvironmentLabelFromMetrics'));

check('sekce „Dnes máš jasno“', todayPanels.includes('Dnes máš jasno'));
check('sekce „Dnešní jídla“', todayPanels.includes('Dnešní jídla'));
check('sekce „Dnešní trénink“', todayPanels.includes('Dnešní trénink'));
check('CTA Recept u dnešních jídel', todayPanels.includes('profile-today-recipe-btn') && todayPanels.includes('Recept'));
check('CTA Nahradit jiným u dnešních jídel', todayPanels.includes('Nahradit jiným'));
check('CTA Zahrnout od dalšího týdne u dnešních jídel', todayPanels.includes('Zahrnout od dalšího týdne'));
check('CTA Jak cvik provést', todayPanels.includes('Jak cvik provést'));
check('typ prostředí v tréninku', todayPanels.includes('profile-today-env-badge') || todayPanels.includes('profile-today-workout-env'));
check('MacroRatioChart v dnešních jídlech', todayPanels.includes('MacroRatioChart'));
check('MacroRatioChart v PlanViewer u jídel', planViewer.includes('MacroRatioChart'));
check('denní makro graf v today hero', todayPanels.includes('Jídlo dnes') && todayPanels.includes('MacroRatioChart'));

check('týdenní accordion Celý týdenní plán', planViewer.includes('Celý týdenní plán'));
check('odkaz Celý týdenní jídelníček', todayPanels.includes('Celý týdenní jídelníček'));
check('tlačítko Rozbalit týden', planViewer.includes('Rozbalit týden'));
check('týdenní plán lze sbalit', planViewer.includes('weeklyPlanOpen'));

const mujPlanIdx = profil.indexOf('id="muj-plan"');
const programVariantsIdx = profil.indexOf('<ProgramVariantsSection');
const programContinuationIdx = profil.indexOf('<ProgramContinuationPanel');
const continuationUpsellIdx = profil.indexOf('<ProfileContinuationUpsell');
const bubblesEndIdx = profil.indexOf('{/* konec profile-bubbles */}');
check('profil neobsahuje ProgramVariantsSection', programVariantsIdx < 0);
check('profil neobsahuje ProgramContinuationPanel', programContinuationIdx < 0);
check('profil neobsahuje ProfileContinuationUpsell', continuationUpsellIdx < 0);
check('profil bez sales textu "Vyber si další krok"', !todayPanels.includes('Vyber si další krok'));
check('profil bez sales CTA "Pokračovat ve STARTU"', !todayPanels.includes('Pokračovat ve STARTU'));

const todayHeadingIdx = planViewer.indexOf('ProfileTodayPanels');
const jidelnicekIdx = planViewer.indexOf('id="plan-jidelnicek"');
check('today panely před týdenním jídelníčkem', todayHeadingIdx >= 0 && jidelnicekIdx > todayHeadingIdx);

check('recept modal má tělo s obsahem', planViewer.includes('plan-recipe-modal-body'));
check('recept modal má tlačítko Zavřít', planViewer.includes('aria-label="Zavřít"'));
check('mealRecipeDisplay má suroviny a postup', read('lib/mealRecipeDisplay.js').includes('ingredients_cs') && read('lib/mealRecipeDisplay.js').includes('instructions_cs'));

check('cvik modal Jak na to', planViewer.includes('Jak na to:'));
check('cvik modal Na co si dát pozor', planViewer.includes('Na co si dát pozor:'));
check('cvik modal Lehčí varianta', planViewer.includes('Lehčí varianta:'));
const exerciseModalStart = planViewer.indexOf('{exerciseHintModal && typeof document');
const exerciseModalChunk = exerciseModalStart >= 0 ? planViewer.slice(exerciseModalStart, exerciseModalStart + 3200) : '';
check(
  'cvik modal série před návodem',
  exerciseModalChunk.includes('Série / opakování')
    && exerciseModalChunk.indexOf('Série / opakování') < exerciseModalChunk.indexOf('renderExerciseInstructionBlock')
);

check('CTA Nahradit jiným v týdenním plánu', planViewer.includes('Nahradit jiným'));
check('CTA Zahrnout od dalšího týdne v týdenním plánu', planViewer.includes('Zahrnout od dalšího týdne'));

const badFixedWidths = (todayPanels.match(/width:\s*(\d{4,})px/g) || [])
  .filter((w) => !w.includes('100'));
check('mobilní today CSS bez extrémních fixed width', badFixedWidths.length === 0, badFixedWidths.join(', ') || 'none');
check('today root overflow-x hidden', todayPanels.includes('overflow-x: hidden'));
check('modaly používají min(…, calc(100vw', planViewer.includes('calc(100vw - 24px)'));

check('npm script verify:profile-today-ux', packageJson.includes('"verify:profile-today-ux"'));

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
