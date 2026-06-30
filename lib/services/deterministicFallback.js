/**
 * lib/services/deterministicFallback.js
 * Pevně definovaný fallback při selhání OpenAI.
 * Žádné generativní chování – pouze lookup v tabulkách.
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md § 2 (fallback a zdroje plánu)
 */
import { deriveWorkoutDays } from '../validation/onboardingSchema';
import { bodyMetricsToPlanInput } from '../bodyMetricsToPlanInput';
import { parseTrainingEnvironment } from '../trainingEnvironment.js';
import { planMealTypeToWeightKey, slotTargetKcal } from '../nutrition/portionScaling';

const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Targets pro plán. Jeden zdroj pravdy pro kalorický cíl: calories_target
 * spočítaný při registraci (body_metrics) — váhová heuristika je jen fallback,
 * když calories_target v DB chybí.
 * Export pro orchestrátor (bez MEAL_QUERIES).
 */
export function computeTargetsForPlan(bodyMetrics) {
  const goal = (bodyMetrics?.goal || 'udrzovani').toLowerCase();
  const caloriesFromRegistration = asNum(bodyMetrics?.calories_target);
  const caloriesOverride =
    caloriesFromRegistration != null && caloriesFromRegistration >= 1000 && caloriesFromRegistration <= 6000
      ? Math.round(caloriesFromRegistration)
      : undefined;
  return computeTargets(goal, bodyMetrics?.weight_kg, caloriesOverride);
}

/** Targets podle goal a weight; caloriesOverride = cíl z registrace (má přednost). */
function computeTargets(goal, weightKg, caloriesOverride) {
  const weight = asNum(weightKg) || 70;
  let calories, protein;
  if (goal === 'redukce') {
    calories = Math.floor((weight * 28 - 300) / 50) * 50;
    protein = Math.round(weight * 1.8);
  } else if (goal === 'nabirani_svaly') {
    calories = Math.ceil((weight * 32 + 200) / 50) * 50;
    protein = Math.round(weight * 2.0);
  } else {
    calories = Math.round(weight * 30 / 50) * 50;
    protein = Math.round(weight * 1.6);
  }
  if (caloriesOverride != null) calories = caloriesOverride;
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
  return { calories_per_day: calories, protein_g: protein, carbs_g: carbs, fat_g: fat };
}

/** Meal search queries: [day_index][meal_type] → search_query */
const MEAL_QUERIES = {
  standard: {
    breakfast: [
      'oatmeal banana eggs',
      'yogurt muesli fruit',
      'eggs whole grain toast',
      'cottage cheese fruit',
      'oatmeal pancakes fruit',
      'smoothie protein toast',
      'omelette vegetables',
    ],
    lunch: [
      'chicken breast rice vegetables',
      'grilled salmon potatoes salad',
      'beef quinoa vegetables',
      'turkey sweet potato',
      'fish rice salad',
      'chicken salad avocado',
      'lean meat vegetables',
    ],
    dinner: [
      'grilled chicken vegetables',
      'salmon salad',
      'turkey vegetables',
      'white fish vegetables',
      'chicken stir fry',
      'lean beef vegetables',
      'fish vegetables',
    ],
    snack: ['greek yogurt nuts', 'apple peanut butter', 'protein bar', 'banana', 'nuts dried fruit', 'cheese crackers', 'smoothie'],
  },
  vegetarian: {
    breakfast: [
      'oatmeal banana',
      'yogurt muesli fruit',
      'chia pudding fruit',
      'avocado toast',
      'smoothie bowl',
      'tofu scramble',
      'oatmeal apple cinnamon',
    ],
    lunch: [
      'lentil rice salad',
      'quinoa chickpea salad',
      'vegetable risotto',
      'falafel hummus',
      'pasta pesto',
      'vegetable stir fry',
      'lentil soup bread',
    ],
    dinner: [
      'vegetable curry lentils',
      'tofu quinoa vegetables',
      'roasted vegetables chickpeas',
      'vegetable soup bread',
      'chickpea salad',
      'pasta tomato basil',
      'lentil stew',
    ],
    snack: ['greek yogurt fruit', 'hummus vegetables', 'cheese fruit', 'nuts', 'smoothie', 'trail mix', 'apple'],
  },
  vegan: {
    breakfast: [
      'oatmeal banana',
      'smoothie banana spinach',
      'chia pudding fruit',
      'avocado toast',
      'smoothie bowl',
      'oatmeal apple cinnamon',
      'vegan yogurt muesli',
    ],
    lunch: [
      'lentil rice salad',
      'quinoa chickpea salad',
      'vegetable curry lentils',
      'falafel hummus',
      'vegetable stir fry',
      'lentil soup bread',
      'chickpea salad',
    ],
    dinner: [
      'tofu quinoa vegetables',
      'vegetable curry lentils',
      'roasted vegetables chickpeas',
      'lentil stew',
      'chickpea salad',
      'pasta tomato basil',
      'vegetable stir fry',
    ],
    snack: ['fruit nuts', 'hummus vegetables', 'smoothie', 'trail mix', 'banana', 'apple', 'nuts'],
  },
};

/**
 * České názvy jídel ve stejném pořadí jako MEAL_QUERIES[diet][type] (fallback / šablona z profilu).
 */
const MEAL_DISPLAY_CS = {
  standard: {
    breakfast: [
      'Ovesná kaše s banánem a vejci',
      'Jogurt s müsli a ovocem',
      'Vejce s celozrnným toastem',
      'Tvaroh s ovocem',
      'Ovesné lívance s ovocem',
      'Smoothie a toast',
      'Omeleta se zeleninou',
    ],
    lunch: [
      'Kuřecí prsa s rýží a zeleninou',
      'Grilovaný losos s bramborami a salátem',
      'Hovězí s quinoou a zeleninou',
      'Krůta se sladkými bramborami',
      'Ryba s rýží a salátem',
      'Kuřecí salát s avokádem',
      'Libové maso se zeleninou',
    ],
    dinner: [
      'Grilované kuře se zeleninou',
      'Losos se salátem',
      'Krůta se zeleninou',
      'Bílá ryba se zeleninou',
      'Kuřecí směs se zeleninou',
      'Libové hovězí se zeleninou',
      'Ryba se zeleninou',
    ],
    snack: [
      'Řecký jogurt s ořechy',
      'Jablko s arašídovým máslem',
      'Proteinová tyčinka',
      'Banán',
      'Ořechy a sušené ovoce',
      'Sýr a krekry',
      'Smoothie',
    ],
  },
  vegetarian: {
    breakfast: [
      'Ovesná kaše s banánem',
      'Jogurt s müsli a ovocem',
      'Chia pudink s ovocem',
      'Avokádový toast',
      'Smoothie bowl',
      'Tofu míchaná vejce',
      'Ovesná kaše s jablkem a skořicí',
    ],
    lunch: [
      'Čočka s rýží a salátem',
      'Salát z quinoy a cizrny',
      'Zeleninové rizoto',
      'Falafel s hummusem',
      'Těstoviny s pestem',
      'Zeleninová směs',
      'Čočková polévka s pečivem',
    ],
    dinner: [
      'Zeleninové kari s čočkou',
      'Tofu s quinoou a zeleninou',
      'Pečená zelenina s cizrnou',
      'Zeleninová polévka s pečivem',
      'Cizrnový salát',
      'Těstoviny s rajčaty a bazalkou',
      'Čočkový guláš',
    ],
    snack: [
      'Řecký jogurt s ovocem',
      'Hummus se zeleninou',
      'Sýr s ovocem',
      'Ořechy',
      'Smoothie',
      'Směs ořechů a ovoce',
      'Jablko',
    ],
  },
  vegan: {
    breakfast: [
      'Ovesná kaše s banánem',
      'Smoothie se špenátem a banánem',
      'Chia pudink s ovocem',
      'Avokádový toast',
      'Smoothie bowl',
      'Ovesná kaše s jablkem a skořicí',
      'Rostlinný jogurt s müsli',
    ],
    lunch: [
      'Čočka s rýží a salátem',
      'Salát z quinoy a cizrny',
      'Zeleninové kari s čočkou',
      'Falafel s hummusem',
      'Zeleninová směs',
      'Čočková polévka s pečivem',
      'Cizrnový salát',
    ],
    dinner: [
      'Tofu s quinoou a zeleninou',
      'Zeleninové kari s čočkou',
      'Pečená zelenina s cizrnou',
      'Čočkový guláš',
      'Cizrnový salát',
      'Těstoviny s rajčaty a bazalkou',
      'Zeleninová směs',
    ],
    snack: [
      'Ovoce s ořechy',
      'Hummus se zeleninou',
      'Smoothie',
      'Směs ořechů a ovoce',
      'Banán',
      'Jablko',
      'Ořechy',
    ],
  },
};

/**
 * Jedno jídlo pro fallback plán: český název + stejný anglický dotaz jako v MEAL_QUERIES.
 * @param {'standard'|'vegetarian'|'vegan'} dietKey
 * @param {'breakfast'|'lunch'|'dinner'|'snack'} mealType
 * @param {number} dayIndex 0–6
 */
function buildFallbackMealSlot(dietKey, mealType, dayIndex) {
  const dk = dietKey === 'vegan' ? 'vegan' : dietKey === 'vegetarian' ? 'vegetarian' : 'standard';
  const tables = MEAL_QUERIES[dk] || MEAL_QUERIES.standard;
  const labels = MEAL_DISPLAY_CS[dk] || MEAL_DISPLAY_CS.standard;
  const type = mealType;
  const arr = tables[type] || tables.breakfast;
  const labArr = labels[type] || labels.breakfast;
  const idx = dayIndex % arr.length;
  const search_query = arr[idx];
  const name_cs = (labArr[idx] || '').trim() || 'Zdravé jídlo';
  return {
    type,
    name_cs,
    ai_name: name_cs,
    search_query,
    spoonacular_query: search_query,
  };
}

/** Normalizace typu jídla z AI / schématu na klíč tabulky MEAL_QUERIES. */
function normalizeMealTypeForFallback(mealType) {
  const t = String(mealType || '').trim().toLowerCase();
  if (['breakfast', 'brunch', 'morning'].includes(t)) return 'breakfast';
  if (['lunch', 'noon'].includes(t)) return 'lunch';
  if (['dinner', 'supper', 'evening'].includes(t)) return 'dinner';
  if (['snack', 'snacks', 'tea'].includes(t)) return 'snack';
  if (['breakfast', 'lunch', 'dinner', 'snack'].includes(t)) return t;
  return 'breakfast';
}

/**
 * Krátké dotazy zacílené na typ jídla – předřazeny před rotaci z MEAL_QUERIES (lepší hit rate ve Spoonacular).
 * Odděleně podle dietKey, aby vegan/vegetarián nedostal masové dotazy.
 */
const MEAL_TYPE_LEADER_QUERIES_BY_DIET = {
  standard: {
    breakfast: ['healthy breakfast oatmeal', 'eggs toast breakfast'],
    lunch: ['chicken rice bowl lunch', 'salad chicken lunch'],
    dinner: ['grilled chicken vegetables dinner', 'salmon dinner vegetables'],
    snack: ['protein snack healthy', 'greek yogurt fruit snack'],
  },
  vegetarian: {
    breakfast: ['oatmeal banana breakfast', 'yogurt muesli breakfast'],
    lunch: ['lentil rice salad lunch', 'quinoa chickpea lunch'],
    dinner: ['vegetable curry lentils dinner', 'tofu quinoa vegetables dinner'],
    snack: ['hummus vegetables snack', 'cheese fruit snack'],
  },
  vegan: {
    breakfast: ['oatmeal banana breakfast', 'smoothie banana spinach breakfast'],
    lunch: ['lentil rice salad lunch', 'quinoa chickpea lunch'],
    dinner: ['tofu quinoa vegetables dinner', 'vegetable curry lentils dinner'],
    snack: ['fruit nuts snack', 'hummus vegetables snack'],
  },
};

/**
 * Vrátí pole fallback search queries pro Spoonacular při miss.
 * Použito v resolveMeals pro automatickou náhradu jídla.
 *
 * @param {string} diet - standard | vegetarian | vegan
 * @param {string} mealType - breakfast | lunch | dinner | snack
 * @returns {string[]}
 */
export function getFallbackMealQueries(diet, mealType) {
  const dietKey = (diet || 'standard').toLowerCase() === 'vegan' ? 'vegan' : (diet || '').toLowerCase() === 'vegetarian' ? 'vegetarian' : 'standard';
  const normalized = normalizeMealTypeForFallback(mealType);
  const tables = MEAL_QUERIES[dietKey] || MEAL_QUERIES.standard;
  const base = Array.isArray(tables[normalized]) ? [...tables[normalized]] : (tables.breakfast ? [...tables.breakfast] : []);
  const leaderTable = MEAL_TYPE_LEADER_QUERIES_BY_DIET[dietKey] || MEAL_TYPE_LEADER_QUERIES_BY_DIET.standard;
  const leaders = leaderTable[normalized] || leaderTable.breakfast || [];
  const seen = new Set();
  const out = [];
  for (const q of [...leaders, ...base]) {
    const k = q.toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(q);
  }
  return out;
}

/** Workout blocks: full body, lower, upper (domácí). */
const HOME_WORKOUT_BLOCKS = [
  [
    { canonical_key: 'squat', search_term: 'squat', sets: 3, reps: '10-12' },
    { canonical_key: 'pushup', search_term: 'push up', sets: 3, reps: '8-10' },
    { canonical_key: 'bent_over_row', search_term: 'bent over row', sets: 3, reps: '10' },
    { canonical_key: 'plank', search_term: 'plank', sets: 3, duration_sec: 45 },
    { canonical_key: 'lunges', search_term: 'lunge', sets: 3, reps: '10 per leg' },
  ],
  [
    { canonical_key: 'squat', search_term: 'squat', sets: 4, reps: '10' },
    { canonical_key: 'lunges', search_term: 'lunge', sets: 3, reps: '10 per leg' },
    { canonical_key: 'glute_bridge', search_term: 'hip bridge', sets: 3, reps: '12' },
    { canonical_key: 'plank', search_term: 'plank', sets: 3, duration_sec: 30 },
    { canonical_key: 'pushup', search_term: 'push up', sets: 3, reps: '12' },
  ],
  [
    { canonical_key: 'pushup', search_term: 'push up', sets: 4, reps: '8-10' },
    { canonical_key: 'bent_over_row', search_term: 'bent over row', sets: 3, reps: '10' },
    { canonical_key: 'overhead_press', search_term: 'shoulder press', sets: 3, reps: '10' },
    { canonical_key: 'plank', search_term: 'plank', sets: 3, duration_sec: 30 },
    { canonical_key: 'lunges', search_term: 'lunge', sets: 3, reps: '10 per leg' },
  ],
];

/** Workout blocks pro posilovnu. */
const GYM_WORKOUT_BLOCKS = [
  [
    { canonical_key: 'leg_press', search_term: 'leg press', sets: 4, reps: '12' },
    { canonical_key: 'bench_press', search_term: 'bench press', sets: 3, reps: '10' },
    { canonical_key: 'bent_over_row', search_term: 'seated row', sets: 3, reps: '10' },
    { canonical_key: 'romanian_deadlift', search_term: 'romanian deadlift', sets: 3, reps: '10' },
    { canonical_key: 'overhead_press', search_term: 'shoulder press', sets: 3, reps: '10' },
  ],
  [
    { canonical_key: 'leg_press', search_term: 'leg press', sets: 4, reps: '10' },
    { canonical_key: 'bench_press', search_term: 'incline bench press', sets: 3, reps: '10' },
    { canonical_key: 'bent_over_row', search_term: 'cable row', sets: 3, reps: '12' },
    { canonical_key: 'tricep_extension', search_term: 'tricep pushdown', sets: 3, reps: '12' },
    { canonical_key: 'bicep_curl', search_term: 'bicep curl', sets: 3, reps: '12' },
  ],
  [
    { canonical_key: 'bench_press', search_term: 'bench press', sets: 4, reps: '8-10' },
    { canonical_key: 'bent_over_row', search_term: 'bent over row', sets: 3, reps: '10' },
    { canonical_key: 'overhead_press', search_term: 'shoulder press', sets: 3, reps: '10' },
    { canonical_key: 'lateral_raise', search_term: 'lateral raise', sets: 3, reps: '12' },
    { canonical_key: 'tricep_extension', search_term: 'tricep extension', sets: 3, reps: '12' },
  ],
];

function workoutBlocksForBodyMetrics(bodyMetrics = {}) {
  return parseTrainingEnvironment(bodyMetrics) === 'gym' ? GYM_WORKOUT_BLOCKS : HOME_WORKOUT_BLOCKS;
}

/** @deprecated alias — použij workoutBlocksForBodyMetrics */
const WORKOUT_BLOCKS = HOME_WORKOUT_BLOCKS;

/**
 * Vrátí deterministic meal plan (7 dní).
 * @param {object} bodyMetrics
 * @returns {{ targets: object, meal_plan: { days: Array } }}
 */
export function getDeterministicMealPlan(bodyMetrics) {
  const goal = (bodyMetrics?.goal || 'udrzovani').toLowerCase();
  const diet = (bodyMetrics?.diet_type || 'standard').toLowerCase();
  const mealsPerDay = Math.min(6, Math.max(2, Number(bodyMetrics?.meals_per_day) || 3));
  const dietKey = diet === 'vegan' ? 'vegan' : diet === 'vegetarian' ? 'vegetarian' : 'standard';

  const mealTypes = mealsPerDay >= 4 ? ['breakfast', 'lunch', 'dinner', 'snack'] : ['breakfast', 'lunch', 'dinner'];
  const usedTypes = mealTypes.slice(0, mealsPerDay);

  const targets = computeTargets(goal, bodyMetrics?.weight_kg);
  const days = [];

  for (let i = 0; i < 7; i++) {
    const meals = usedTypes.map((type) => buildFallbackMealSlot(dietKey, type, i));
    days.push({ day_index: i, day_name: CZECH_DAYS[i], meals });
  }

  return { targets, meal_plan: { meals_per_day: mealsPerDay, days } };
}

/**
 * Vrátí deterministic workout plan.
 * @param {object} bodyMetrics
 * @returns {{ workout_days: number[], days: Array }}
 */
export function getDeterministicWorkoutPlan(bodyMetrics) {
  const workoutsPerWeek = Math.min(7, Math.max(0, Number(bodyMetrics?.workouts_per_week) || 3));
  const preferred = bodyMetrics?.preferred_workout_days;
  const workoutDays = deriveWorkoutDays(workoutsPerWeek, preferred);

  const blocks = workoutBlocksForBodyMetrics(bodyMetrics);
  const days = workoutDays.map((dayIndex, i) => ({
    day_index: dayIndex,
    exercises: blocks[i % blocks.length].map((e) => ({ ...e })),
  }));

  return { workout_days: workoutDays, days };
}

/**
 * Minimální 7denní meal_plan jen z profilu (diet, goal, meals_per_day) — žádná rotace MEAL_QUERIES.
 * Použito když OpenAI nevrátí meal_plan; není náhrada za živé Spoonacular výsledky.
 * @param {object} bodyMetrics
 * @returns {{ meals_per_day: number, days: Array }}
 */
export function buildProfileTemplateMealPlan(bodyMetrics) {
  const diet = (bodyMetrics?.diet_type || 'standard').toLowerCase();
  const dietKey = diet === 'vegan' ? 'vegan' : diet === 'vegetarian' ? 'vegetarian' : 'standard';
  const mealsPerDay = bodyMetricsToPlanInput(bodyMetrics).meals_per_day;
  const mealTypes = mealsPerDay >= 4 ? ['breakfast', 'lunch', 'dinner', 'snack'] : ['breakfast', 'lunch', 'dinner'];
  const usedTypes = mealTypes.slice(0, mealsPerDay);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const meals = usedTypes.map((type) => buildFallbackMealSlot(dietKey, type, i));
    days.push({ day_index: i, day_name: CZECH_DAYS[i], meals });
  }
  return { meals_per_day: mealsPerDay, days };
}

/**
 * Deterministický skeleton pro katalog: slot typy + target_kcal ze slotTargetKcal (bez GPT).
 * @param {object} bodyMetrics
 * @returns {{ targets: object, meal_plan: { meals_per_day: number, days: Array } }}
 */
export function buildCatalogSkeletonPlan(bodyMetrics) {
  const planInput = bodyMetricsToPlanInput(bodyMetrics);
  const targets = computeTargetsForPlan(bodyMetrics);
  const mealsPerDay = planInput.meals_per_day;
  const daily = Number(targets.calories_per_day) || 2200;
  const mealTypes =
    mealsPerDay >= 4 ? ['breakfast', 'lunch', 'dinner', 'snack'] : ['breakfast', 'lunch', 'dinner'];
  const usedTypes = mealTypes.slice(0, mealsPerDay);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const meals = usedTypes.map((type) => {
      const weightKey = planMealTypeToWeightKey(type);
      return {
        type,
        target_kcal: slotTargetKcal(daily, mealsPerDay, weightKey),
      };
    });
    days.push({ day_index: i, day_name: CZECH_DAYS[i], meals });
  }
  return { targets, meal_plan: { meals_per_day: mealsPerDay, days } };
}
