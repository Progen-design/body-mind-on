/**
 * SimpleMealPlannerAgent — deterministický agent-like plánovač START jídelníčku.
 * Source of truth pro initial_plan / initial_7_day_trial. Katalog jen mapuje záměr.
 */
import { planMealTypeToWeightKey, slotTargetKcal } from '../nutrition/portionScaling.js';

const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

/** Explicitní instrukční blok agenta (pro dokumentaci, testy, případný GPT kontext). */
export const SIMPLE_MEAL_PLANNER_AGENT_INSTRUCTIONS = `Jsi praktický výživový kouč Body & Mind ON.
Tvým cílem není vytvořit zajímavý nebo gurmánský jídelníček.
Tvým cílem je vytvořit jídelníček, který obyčejný člověk opravdu zvládne dodržet.

Pravidla:
- jednoduchost > originalita
- dostupnost > pestrost
- opakovatelnost > složitost
- levné potraviny > exotické potraviny
- rychlá příprava > zajímavý recept
- snídaně a svačiny mají být extrémně jednoduché
- obědy a večeře mají být běžná fitness jídla
- vysoké kalorie řeš větší porcí, ne složitějším receptem
- jídla se mohou opakovat
- každý den může mít podobnou strukturu
- uživatel musí hned vědět, co koupit a připravit

Zakázané jako START default:
burrito, slanina jako hlavní snídaně, pomerančové kuře, kokosové kari, ramen, frittata, lasagne,
krabí, salsa, pesto, kaviár, fenykl, baby řepa, vodní zelí, glazura, redukce, quinoa jako častý základ,
chřest jako default, food-blog názvy.`;

const FORBIDDEN_DEFAULT = [
  'burrito',
  'pomeranč',
  'kokos',
  'kari',
  'ramen',
  'frittata',
  'lasagne',
  'krab',
  'salsa',
  'pesto',
  'kaviár',
  'fenykl',
  'glazura',
  'redukce',
  'quinoa',
  'chřest',
  'confit',
  'mexick',
];

/** @typedef {object} StartMealTemplate */
const START_MEAL_TEMPLATES = {
  standard: {
    breakfast: [
      tpl('Tvaroh s vločkami a banánem', ['tvaroh', 'vločk', 'banán'], fb(420, 28, 52, 10, ['tvaroh 200 g', 'ovesné vločky 50 g', 'banán 1 ks']), 10, 4),
      tpl('Řecký jogurt s ovocem', ['jogurt', 'ovoce', 'banán', 'jablko'], fb(380, 22, 45, 12, ['řecký jogurt 200 g', 'banán nebo jablko 1 ks', 'mandle 15 g']), 5, 3),
      tpl('Vejce s pečivem a zeleninou', ['vejce', 'pečivo', 'zelenina'], fb(450, 24, 38, 22, ['vejce 3 ks', 'celozrné pečivo 2 plátky', 'okurka nebo rajče']), 15, 4),
      tpl('Ovesná kaše s proteinem', ['ovesn', 'kaše', 'vločk', 'banán'], fb(400, 14, 58, 12, ['ovesné vločky 60 g', 'mléko 200 ml', 'banán 1 ks']), 10, 4),
      tpl('Cottage s pečivem', ['cottage', 'pečivo'], fb(380, 22, 32, 14, ['cottage 150 g', 'celozrné pečivo 2 plátky', 'zelenina']), 5, 3),
      tpl('Šunka, sýr, pečivo a zelenina', ['šunka', 'sýr', 'pečivo', 'zelenina'], fb(420, 22, 35, 18, ['šunka 60 g', 'sýr 2 plátky', 'pečivo 2 plátky', 'zelenina']), 5, 4),
    ],
    snack: [
      tpl('Jogurt s ovocem', ['jogurt', 'ovoce', 'banán'], fb(220, 14, 28, 6, ['jogurt 180 g', 'banán nebo jablko 1 ks']), 3, 2),
      tpl('Tvaroh s ovocem', ['tvaroh', 'ovoce'], fb(240, 20, 22, 8, ['tvaroh 180 g', 'banán 1 ks']), 3, 2),
      tpl('Cottage s pečivem', ['cottage', 'pečivo'], fb(260, 18, 24, 10, ['cottage 150 g', 'celozrné pečivo 1 plátek']), 3, 2),
      tpl('Proteinový nápoj a banán', ['protein', 'banán'], fb(280, 25, 32, 4, ['proteinový nápoj 1 dávka', 'banán 1 ks']), 2, 2),
      tpl('Sendvič se šunkou', ['sendvič', 'šunka', 'pečivo'], fb(300, 18, 30, 12, ['celozrné pečivo 2 plátky', 'šunka 60 g', 'sýr 1 plátek', 'zelenina']), 5, 4),
      tpl('Vejce natvrdo se zeleninou', ['vejce', 'natvrdo', 'zelenina'], fb(250, 16, 8, 16, ['vejce 2 ks', 'zelenina 100 g']), 10, 2),
      tpl('Kefír a pečivo', ['kefír', 'pečivo'], fb(230, 12, 28, 8, ['kefír 250 ml', 'celozrné pečivo 1 plátek']), 2, 2),
    ],
    lunch: [
      tpl('Kuře s rýží a zeleninou', ['kuře', 'rýž', 'zelenin'], fb(620, 42, 65, 16, ['kuřecí prsa 150 g', 'rýže 80 g', 'zelenina 150 g', 'olivový olej 1 lžíce']), 25, 5),
      tpl('Krůtí maso s bramborem', ['krůt', 'brambor', 'zelenin'], fb(580, 40, 48, 18, ['krůtí prsa 150 g', 'brambory 250 g', 'zelenina 150 g']), 30, 5),
      tpl('Těstoviny s tuňákem', ['těstovin', 'tuňák'], fb(600, 38, 68, 14, ['těstoviny 80 g', 'tuňák ve vlastní šťávě 1 konzerva', 'zelenina 100 g']), 20, 4),
      tpl('Rýže s vejcem a zeleninou', ['rýž', 'vejce', 'zelenin'], fb(540, 22, 72, 14, ['rýže 80 g', 'vejce 2 ks', 'zelenina 150 g', 'olivový olej 1 lžíce']), 20, 5),
      tpl('Čočka s vejcem', ['čočk', 'vejce', 'zelenin'], fb(550, 32, 58, 16, ['čočka 80 g', 'vejce 2 ks', 'zelenina 150 g']), 25, 5),
      tpl('Fazole s rýží', ['fazole', 'rýž'], fb(520, 24, 78, 12, ['fazole 1 konzerva', 'rýže 70 g', 'zelenina 100 g']), 25, 4),
      tpl('Kuřecí tortilla jednoduchá', ['kuřec', 'tortilla', 'zelenin'], fb(580, 38, 55, 18, ['kuřecí prsa 120 g', 'tortilla 2 ks', 'zelenina 150 g'], ['pomeranč', 'kari', 'salsa']), 20, 5),
    ],
    dinner: [
      tpl('Omeleta se zeleninou', ['omeleta', 'vejce', 'zelenin'], fb(480, 32, 18, 28, ['vejce 3 ks', 'zelenina 200 g', 'olivový olej 1 lžíce']), 15, 4),
      tpl('Tuňákový salát s pečivem', ['tuňák', 'salát', 'pečivo'], fb(520, 36, 42, 18, ['tuňák ve vlastní šťávě 1 konzerva', 'zelenina 150 g', 'celozrné pečivo 2 plátky']), 10, 4),
      tpl('Kuře se zeleninou', ['kuře', 'zelenin'], fb(500, 42, 20, 22, ['kuřecí prsa 150 g', 'zelenina 250 g', 'olivový olej 1 lžíce']), 25, 4),
      tpl('Brambory s vejcem', ['brambor', 'vejce'], fb(500, 20, 52, 22, ['brambory 300 g', 'vejce 2 ks', 'zelenina 100 g']), 25, 4),
      tpl('Tvarohová miska', ['tvaroh', 'banán'], fb(420, 34, 32, 14, ['tvaroh 250 g', 'banán 1 ks', 'mandle 15 g']), 5, 3),
      tpl('Cottage talíř', ['cottage', 'pečivo', 'zelenin'], fb(440, 32, 28, 18, ['cottage 200 g', 'pečivo 1 plátek', 'zelenina 150 g']), 5, 4),
      tpl('Těstoviny s kuřetem', ['těstovin', 'kuře'], fb(560, 40, 62, 16, ['těstoviny 80 g', 'kuřecí prsa 120 g', 'zelenina 100 g']), 25, 4),
    ],
  },
  vegetarian: {
    breakfast: [
      tpl('Tvaroh s vločkami a banánem', ['tvaroh', 'vločk', 'banán'], fb(420, 28, 52, 10, ['tvaroh 200 g', 'ovesné vločky 50 g', 'banán 1 ks']), 10, 4),
      tpl('Řecký jogurt s ovocem', ['jogurt', 'ovoce'], fb(380, 22, 45, 12, ['řecký jogurt 200 g', 'banán nebo jablko 1 ks']), 5, 3),
      tpl('Vejce s pečivem a zeleninou', ['vejce', 'pečivo'], fb(450, 24, 38, 22, ['vejce 3 ks', 'celozrné pečivo 2 plátky', 'zelenina']), 15, 4),
      tpl('Ovesná kaše s proteinem', ['ovesn', 'kaše', 'vločk'], fb(400, 14, 58, 12, ['ovesné vločky 60 g', 'mléko 200 ml', 'banán 1 ks']), 10, 4),
      tpl('Cottage s pečivem', ['cottage', 'pečivo'], fb(380, 22, 32, 14, ['cottage 150 g', 'celozrné pečivo 2 plátky']), 5, 3),
    ],
    snack: [
      tpl('Jogurt s ovocem', ['jogurt', 'ovoce'], fb(220, 14, 28, 6, ['jogurt 180 g', 'banán 1 ks']), 3, 2),
      tpl('Tvaroh s ovocem', ['tvaroh', 'ovoce'], fb(240, 20, 22, 8, ['tvaroh 180 g', 'banán 1 ks']), 3, 2),
      tpl('Cottage s pečivem', ['cottage', 'pečivo'], fb(260, 18, 24, 10, ['cottage 150 g', 'pečivo 1 plátek']), 3, 2),
      tpl('Kefír a pečivo', ['kefír', 'pečivo'], fb(230, 12, 28, 8, ['kefír 250 ml', 'pečivo 1 plátek']), 2, 2),
    ],
    lunch: [
      tpl('Rýže s vejcem a zeleninou', ['rýž', 'vejce', 'zelenin'], fb(540, 22, 72, 14, ['rýže 80 g', 'vejce 2 ks', 'zelenina 150 g']), 20, 5),
      tpl('Čočka s vejcem', ['čočk', 'vejce'], fb(550, 32, 58, 16, ['čočka 80 g', 'vejce 2 ks', 'zelenina 150 g']), 25, 5),
      tpl('Fazole s rýží', ['fazole', 'rýž'], fb(520, 24, 78, 12, ['fazole 1 konzerva', 'rýže 70 g', 'zelenina 100 g']), 25, 4),
      tpl('Těstoviny se zeleninou', ['těstovin', 'zelenin'], fb(520, 16, 78, 14, ['těstoviny 80 g', 'zelenina 200 g', 'olivový olej 1 lžíce']), 20, 4),
    ],
    dinner: [
      tpl('Omeleta se zeleninou', ['omeleta', 'vejce'], fb(480, 32, 18, 28, ['vejce 3 ks', 'zelenina 200 g']), 15, 4),
      tpl('Brambory s vejcem', ['brambor', 'vejce'], fb(500, 20, 52, 22, ['brambory 300 g', 'vejce 2 ks']), 25, 4),
      tpl('Tvarohová miska', ['tvaroh'], fb(420, 34, 32, 14, ['tvaroh 250 g', 'banán 1 ks']), 5, 3),
      tpl('Cottage talíř', ['cottage', 'zelenin'], fb(440, 32, 28, 18, ['cottage 200 g', 'zelenina 150 g', 'pečivo 1 plátek']), 5, 4),
    ],
  },
  vegan: {
    breakfast: [
      tpl('Ovesná kaše s ovocem', ['ovesn', 'vločk', 'banán'], fb(380, 12, 62, 10, ['ovesné vločky 60 g', 'rostlinné mléko 200 ml', 'banán 1 ks']), 10, 3),
      tpl('Chleba s arašídovým máslem a banánem', ['chleba', 'banán', 'arašíd'], fb(420, 14, 52, 16, ['celozrné pečivo 2 plátky', 'arašídové máslo 30 g', 'banán 1 ks']), 5, 3),
    ],
    snack: [
      tpl('Ovoce a ořechy', ['ovoce', 'ořech', 'banán'], fb(250, 8, 28, 12, ['banán 1 ks', 'mandle 20 g']), 2, 2),
      tpl('Hummus a pečivo', ['hummus', 'pečivo'], fb(280, 10, 32, 12, ['hummus 80 g', 'celozrné pečivo 2 plátky']), 3, 2),
    ],
    lunch: [
      tpl('Fazole s rýží', ['fazole', 'rýž'], fb(520, 24, 78, 12, ['fazole 1 konzerva', 'rýže 70 g', 'zelenina 100 g']), 25, 4),
      tpl('Čočka se zeleninou', ['čočk', 'zelenin'], fb(500, 26, 68, 10, ['čočka 80 g', 'zelenina 200 g']), 25, 4),
      tpl('Těstoviny se zeleninou', ['těstovin', 'zelenin'], fb(520, 16, 78, 14, ['těstoviny 80 g', 'zelenina 200 g']), 20, 4),
    ],
    dinner: [
      tpl('Brambory se zeleninou', ['brambor', 'zelenin'], fb(480, 10, 58, 16, ['brambory 350 g', 'zelenina 200 g', 'olivový olej 1 lžíce']), 25, 4),
      tpl('Rýže s fazolemi', ['rýž', 'fazole'], fb(500, 22, 82, 10, ['rýže 80 g', 'fazole 1 konzerva', 'zelenina 100 g']), 25, 4),
    ],
  },
};

function fb(kcal, protein_g, carbs_g, fat_g, shopping_ingredient_lines) {
  return { kcal, protein_g, carbs_g, fat_g, shopping_ingredient_lines };
}

function tpl(name_cs, allowed, fallback, prep_time_max_minutes, max_main_ingredients, extraForbidden = []) {
  return {
    name_cs,
    allowed_catalog_match_terms: allowed,
    forbidden_catalog_terms: [...FORBIDDEN_DEFAULT, ...extraForbidden],
    fallback_meal_template: { name_cs, ...fallback },
    prep_time_max_minutes,
    max_main_ingredients,
  };
}

function resolveMealsPerDay(bodyMetrics, mealsPerDayIn) {
  if (mealsPerDayIn != null) return mealsPerDayIn;
  const n = Number(bodyMetrics?.meals_per_day);
  if (Number.isFinite(n) && n >= 2 && n <= 6) return n;
  return 3;
}

function resolveTargets(bodyMetrics, targets) {
  if (targets?.calories_per_day) return targets;
  const ct = Number(bodyMetrics?.calories_target);
  const calories = Number.isFinite(ct) && ct >= 1000 ? Math.round(ct) : 2200;
  const weight = Number(bodyMetrics?.weight_kg) || 70;
  const goal = String(bodyMetrics?.goal || 'udrzovani').toLowerCase();
  let protein = Math.round(weight * 1.6);
  if (goal === 'redukce') protein = Math.round(weight * 1.8);
  if (goal === 'nabirani_svaly') protein = Math.round(weight * 2.0);
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
  return { calories_per_day: calories, protein_g: protein, carbs_g: carbs, fat_g: fat };
}

function dietKey(bodyMetrics) {
  const d = String(bodyMetrics?.diet_type || 'standard').toLowerCase();
  if (d === 'vegan') return 'vegan';
  if (d === 'vegetarian') return 'vegetarian';
  return 'standard';
}

function mealTypesForCount(mealsPerDay) {
  const all = ['breakfast', 'lunch', 'dinner', 'snack'];
  return all.slice(0, Math.max(2, Math.min(4, Number(mealsPerDay) || 3)));
}

/**
 * @param {object} params
 * @param {object} params.bodyMetrics
 * @param {object} [params.targets]
 * @param {number} [params.days=7]
 * @param {number} [params.mealsPerDay]
 * @returns {{ targets: object, meal_plan: { meals_per_day: number, days: Array } }}
 */
export function buildSimpleStartMealSkeleton({ bodyMetrics, targets, days = 7, mealsPerDay: mealsPerDayIn }) {
  const computedTargets = resolveTargets(bodyMetrics, targets);
  const mealsPerDay = resolveMealsPerDay(bodyMetrics, mealsPerDayIn);
  const daily = Number(computedTargets.calories_per_day) || 2200;
  const dk = dietKey(bodyMetrics);
  const templates = START_MEAL_TEMPLATES[dk] || START_MEAL_TEMPLATES.standard;
  const usedTypes = mealTypesForCount(mealsPerDay);
  const planDays = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const meals = usedTypes.map((type, mi) => {
      const pool = templates[type] || templates.lunch;
      const tplIdx = (dayIndex + mi) % pool.length;
      const mealTpl = pool[tplIdx];
      const weightKey = planMealTypeToWeightKey(type);
      const target_kcal = slotTargetKcal(daily, mealsPerDay, weightKey);

      return {
        type,
        name_cs: mealTpl.name_cs,
        target_kcal,
        simplicity_level: 'very_simple',
        allowed_catalog_match_terms: mealTpl.allowed_catalog_match_terms,
        forbidden_catalog_terms: mealTpl.forbidden_catalog_terms,
        fallback_meal_template: mealTpl.fallback_meal_template,
        prep_time_max_minutes: mealTpl.prep_time_max_minutes,
        max_main_ingredients: mealTpl.max_main_ingredients,
        simple_start_mode: true,
        planner_source: 'simple_meal_planner_agent',
      };
    });

    planDays.push({
      day_index: dayIndex,
      day_name: CZECH_DAYS[dayIndex],
      meals,
    });
  }

  console.log('[simple-meal-planner-agent] skeleton built', {
    days: planDays.length,
    meals_per_day: mealsPerDay,
    diet: dk,
  });

  return {
    targets: computedTargets,
    meal_plan: {
      meals_per_day: mealsPerDay,
      days: planDays,
      planner_source: 'simple_meal_planner_agent',
    },
  };
}

export default buildSimpleStartMealSkeleton;
