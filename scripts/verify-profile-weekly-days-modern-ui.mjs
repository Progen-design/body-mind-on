#!/usr/bin/env node
/**
 * Statická kontrola: ostatní dny v týdenním přehledu profilu používají moderní day UI
 * (sdílený renderer ProfileDayMealsPanel), dnešní den zůstává kompaktní bez duplicit.
 *   node scripts/verify-profile-weekly-days-modern-ui.mjs
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

const planViewer = read('components/PlanViewer.js');
const todayPanels = read('components/profile/ProfileTodayPanels.js');
const dayPanel = read('components/profile/ProfileDayMealsPanel.js');
const packageJson = read('package.json');

// --- Sdílený renderer existuje a má moderní design ---
check('ProfileDayMealsPanel existuje', dayPanel.length > 0);
check('sdílený panel používá moderní meal card', dayPanel.includes('profile-today-meal-card'));
check('sdílený panel má kcal headline', dayPanel.includes('profile-today-meal-kcal-main'));
check('sdílený panel má makra', dayPanel.includes('profile-today-meal-macros'));
check('sdílený panel má MacroRatioChart', dayPanel.includes('MacroRatioChart'));
check('sdílený panel má ingredience', dayPanel.includes('profile-today-meal-ingredients'));
check('sdílený panel má CTA Recept', dayPanel.includes('profile-today-recipe-btn') && dayPanel.includes('Recept'));
check('sdílený panel má CTA Nahradit jiným', dayPanel.includes('Nahradit jiným'));
check('sdílený panel má CTA Zahrnout od dalšího týdne', dayPanel.includes('Zahrnout od dalšího týdne'));
check('sdílený panel umí trénink dne', dayPanel.includes('Trénink tento den') && dayPanel.includes('Jak cvik provést'));
check('sdílený panel bezpečně řeší volno', dayPanel.includes('bez plánovaného tréninku'));

// --- Today panel i weekly dny používají STEJNÝ renderer ---
check('ProfileTodayPanels používá sdílený renderer', todayPanels.includes('ProfileDayMealsPanel'));
check('PlanViewer importuje sdílený renderer', planViewer.includes("import ProfileDayMealsPanel from './profile/ProfileDayMealsPanel'"));

// --- Weekly accordion: dnešek kompaktní, ostatní dny moderní ---
const compactIdx = planViewer.indexOf('plan-day-today-compact');
check('dnešní den v týdnu je kompaktní (žádné duplicitní meal karty)', /todayFirstLayout && day\.isToday \? \(/.test(planViewer) && compactIdx >= 0);
check('kompaktní stav odkazuje nahoru na Dnešní plán', planViewer.includes('Přejít na Dnešní plán'));

const modernBranchIdx = planViewer.indexOf(') : todayFirstLayout ? (');
check('ostatní dny mají moderní větev (ne starý layout)', modernBranchIdx > compactIdx && compactIdx >= 0);
const modernChunk = modernBranchIdx >= 0 ? planViewer.slice(modernBranchIdx, modernBranchIdx + 3000) : '';
check('moderní větev renderuje ProfileDayMealsPanel', modernChunk.includes('<ProfileDayMealsPanel'));
check('moderní větev nepoužívá staré plan-meal-card', !modernChunk.includes('plan-meal-card'));

// --- Správné mapování dne a indexu jídla ---
check('recipe handler používá správný den+index', modernChunk.includes('performOpenRecipe(di, mi, e)'));
check('swap handler používá správný den+index', modernChunk.includes('performMealSwap(di, mi)'));
check('pin handler používá správný den+index', modernChunk.includes('performPinMealForNextWeek(di, mi)'));
check('exercise handler používá správný den+index', modernChunk.includes('performOpenExercise(di, xi'));
check('dayIndexForKeys mapuje originalIndex', modernChunk.includes('dayIndexForKeys={day.originalIndex ?? di}'));
check('structDay se předává pro správná jídla dne', modernChunk.includes('structDay={structDayForTotal}'));

// --- Moderní větev zachovává funkce dne ---
check('moderní větev má součet kcal dne', modernChunk.includes('Celkem za den'));
check('moderní větev má nákupní akce', modernChunk.includes('renderDayShoppingActions()'));

// --- Mobile bez overflow ---
const badFixedWidths = (dayPanel.match(/width:\s*(\d{4,})px/g) || []).filter((w) => !w.includes('100'));
check('sdílený panel bez extrémních fixed width', badFixedWidths.length === 0, badFixedWidths.join(', ') || 'none');
check('sdílený panel má min-width: 0 (mobile safe)', dayPanel.includes('min-width: 0'));
check('meal karty max-width 100%', dayPanel.includes('max-width: 100%'));

// --- Žádné rozbité hodnoty v UI ---
check('title má fallback (žádné undefined)', dayPanel.includes('title || mealTypeLabel(meal.type)'));
check('kcal jen když existuje (žádné null)', dayPanel.includes('nutrition.calories != null'));
check('makra jen když existují', dayPanel.includes('nutrition.protein_g != null'));
check('žádné přímé vypsání objektu', !/\{\s*structMeal\s*\}\s*</.test(dayPanel) && !/\{\s*meal\s*\}\s*</.test(dayPanel));

// --- Source of truth zachovaný ---
check('PlanViewer stále používá buildStructuredWeekSource', planViewer.includes('buildStructuredWeekSource'));
check('structured_plan_json zůstává zdroj', planViewer.includes('structured_plan_json'));

check('npm script verify:profile-weekly-days-modern-ui', packageJson.includes('"verify:profile-weekly-days-modern-ui"'));

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
