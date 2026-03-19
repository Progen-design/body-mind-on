/**
 * lib/services/deterministicFallback.js
 * Pevně definovaný fallback při selhání OpenAI.
 * Žádné generativní chování – pouze lookup v tabulkách.
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md § Fallback Rules
 */
import { deriveWorkoutDays } from '../validation/onboardingSchema';

const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

/** Targets podle goal a weight. */
function computeTargets(goal, weightKg) {
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
 * Vrátí pole fallback search queries pro Spoonacular při miss.
 * Použito v resolveMeals pro automatickou náhradu jídla.
 *
 * @param {string} diet - standard | vegetarian | vegan
 * @param {string} mealType - breakfast | lunch | dinner | snack
 * @returns {string[]}
 */
export function getFallbackMealQueries(diet, mealType) {
  const dietKey = (diet || 'standard').toLowerCase() === 'vegan' ? 'vegan' : (diet || '').toLowerCase() === 'vegetarian' ? 'vegetarian' : 'standard';
  const type = (mealType || 'breakfast').toLowerCase();
  const tables = MEAL_QUERIES[dietKey] || MEAL_QUERIES.standard;
  return Array.isArray(tables[type]) ? [...tables[type]] : (tables.breakfast ? [...tables.breakfast] : []);
}

/** Workout blocks: full body, lower, upper. */
const WORKOUT_BLOCKS = [
  [
    { search_term: 'squat', sets: 3, reps: '10-12' },
    { search_term: 'push up', sets: 3, reps: '8-10' },
    { search_term: 'bent over row', sets: 3, reps: '10' },
    { search_term: 'plank', sets: 3, duration_sec: 45 },
    { search_term: 'lunge', sets: 3, reps: '10 per leg' },
  ],
  [
    { search_term: 'squat', sets: 4, reps: '10' },
    { search_term: 'lunge', sets: 3, reps: '10 per leg' },
    { search_term: 'hip bridge', sets: 3, reps: '12' },
    { search_term: 'plank', sets: 3, duration_sec: 30 },
    { search_term: 'crunch', sets: 3, reps: '15' },
  ],
  [
    { search_term: 'push up', sets: 4, reps: '8-10' },
    { search_term: 'bent over row', sets: 3, reps: '10' },
    { search_term: 'shoulder press', sets: 3, reps: '10' },
    { search_term: 'plank', sets: 3, duration_sec: 30 },
    { search_term: 'bicycle crunch', sets: 3, reps: '12 per side' },
  ],
];

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
  const tables = MEAL_QUERIES[dietKey] || MEAL_QUERIES.standard;

  const mealTypes = mealsPerDay >= 4 ? ['breakfast', 'lunch', 'dinner', 'snack'] : ['breakfast', 'lunch', 'dinner'];
  const usedTypes = mealTypes.slice(0, mealsPerDay);

  const targets = computeTargets(goal, bodyMetrics?.weight_kg);
  const days = [];

  for (let i = 0; i < 7; i++) {
    const meals = usedTypes.map((type) => {
      const arr = tables[type] || tables.breakfast;
      return { type, search_query: arr[i % arr.length] };
    });
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

  const days = workoutDays.map((dayIndex, i) => ({
    day_index: dayIndex,
    exercises: WORKOUT_BLOCKS[i % WORKOUT_BLOCKS.length].map((e) => ({ ...e })),
  }));

  return { workout_days: workoutDays, days };
}
