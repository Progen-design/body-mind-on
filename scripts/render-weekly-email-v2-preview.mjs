import { writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildWeeklyPlanEmailV2Document } from '../lib/weeklyPlanEmailV2.js';

const DAY_NAMES = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];

function makeVerifiedMeal(type, id) {
  const macros = {
    breakfast: { calories: 400, protein_g: 20, carbs_g: 41, fat_g: 12, fiber_g: 6 },
    lunch: { calories: 650, protein_g: 38, carbs_g: 55, fat_g: 15, fiber_g: 7 },
    dinner: { calories: 600, protein_g: 35, carbs_g: 48, fat_g: 16, fiber_g: 6 },
  }[type];
  return {
    type,
    recipe_verified: true,
    recipe: { id, ...macros, title: `Recept ${id}` },
    title: `Jídlo ${id}`,
  };
}

function makeUnverifiedMeal(type, id) {
  return {
    type,
    recipe_verified: false,
    recipe: { id, title: `Neověřeno ${id}` },
    title: `Neověřené jídlo ${id}`,
  };
}

const verifiedPlan = {
  valid_from: '2026-05-11',
  workouts_per_week: 4,
  targets: { calories_per_day: 3000, protein_g: 200, carbs_g: 350, fat_g: 80 },
  habits: ['Drž se plánu.', 'Odpočívej mezi tréninky.', 'Dodržuj pitný režim.'],
  days: DAY_NAMES.map((day_name, i) => ({
    day_name,
    date: `2026-05-${String(11 + i).padStart(2, '0')}`,
    meals: [
      makeVerifiedMeal('breakfast', 100 + i),
      makeVerifiedMeal('lunch', 200 + i),
      makeVerifiedMeal('dinner', 300 + i),
    ],
    workout: {
      exercises:
        i % 2 === 0
          ? [
              { name: 'Dřepy', sets: 3, reps: 12 },
              { name: 'Kliky', sets: 3, reps: 10 },
            ]
          : [],
    },
  })),
};

const unverifiedPlan = {
  ...verifiedPlan,
  days: DAY_NAMES.map((day_name, i) => ({
    day_name,
    date: `2026-05-${String(11 + i).padStart(2, '0')}`,
    meals: [
      makeUnverifiedMeal('breakfast', 100 + i),
      makeUnverifiedMeal('lunch', 200 + i),
      makeUnverifiedMeal('dinner', 300 + i),
    ],
    workout: { exercises: [] },
  })),
};

const verifiedDoc = buildWeeklyPlanEmailV2Document({
  structuredPlanJson: verifiedPlan,
  bodyMetrics: { height_cm: 195, weight_kg: 95, goal: 'nabirani_svaly', name: 'Jan' },
  firstName: 'Jan',
  appBaseUrl: 'https://app.bodyandmindon.cz',
  ctaUrl: 'https://app.bodyandmindon.cz',
  validFrom: '2026-05-11',
});

const unverifiedDoc = buildWeeklyPlanEmailV2Document({
  structuredPlanJson: unverifiedPlan,
  bodyMetrics: { height_cm: 195, weight_kg: 95, goal: 'nabirani_svaly', name: 'Jan' },
  firstName: 'Jan',
  appBaseUrl: 'https://app.bodyandmindon.cz',
  ctaUrl: 'https://app.bodyandmindon.cz',
  validFrom: '2026-05-11',
});

const out1 = join(tmpdir(), 'body-mind-on-weekly-plan-email-v2-preview.html');
const out2 = join(tmpdir(), 'body-mind-on-weekly-plan-email-v2-preview-unverified.html');
writeFileSync(out1, verifiedDoc, 'utf8');
writeFileSync(out2, unverifiedDoc, 'utf8');
console.log('verified:', out1);
console.log('unverified:', out2);
