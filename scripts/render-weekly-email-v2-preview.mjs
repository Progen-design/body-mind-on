import { writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildWeeklyPlanEmailV2Document } from '../lib/weeklyPlanEmailV2.js';

const sample = {
  valid_from: '2026-05-11',
  workouts_per_week: 4,
  targets: { calories_per_day: 3000, protein_g: 200, carbs_g: 350, fat_g: 80 },
  habits: ['Drž se plánu.', 'Odpočívej mezi tréninky.', 'Dodržuj pitný režim.'],
  days: [
    {
      day_name: 'Pondělí',
      date: '2026-05-11',
      meals: [
        {
          type: 'breakfast',
          recipe_verified: true,
          recipe: { id: 1, calories: 400, protein_g: 7, carbs_g: 41, fat_g: 7, fiber_g: 6 },
          title: 'Vaječná míchanice',
        },
        {
          type: 'lunch',
          recipe_verified: true,
          recipe: { id: 2, calories: 653, protein_g: 29, carbs_g: 55, fat_g: 8, fiber_g: 6 },
          title: 'Grilované kuře s rýží',
        },
        {
          type: 'dinner',
          recipe_verified: true,
          recipe: { id: 3, calories: 653, protein_g: 29, carbs_g: 55, fat_g: 8, fiber_g: 6 },
          title: 'Tuňákový salát',
        },
      ],
      workout: {
        exercises: [
          { name: 'Dřepy', sets: 3, reps: 12 },
          { name: 'Kliky', sets: 3, reps: 10 },
        ],
      },
    },
  ],
};

const doc = buildWeeklyPlanEmailV2Document({
  structuredPlanJson: sample,
  bodyMetrics: { height_cm: 195, weight_kg: 95, goal: 'nabirani_svaly', name: 'Jan' },
  firstName: 'Jan',
  appBaseUrl: 'https://app.bodyandmindon.cz',
  ctaUrl: 'https://app.bodyandmindon.cz',
  validFrom: '2026-05-11',
});

const out = join(tmpdir(), 'body-mind-on-weekly-plan-email-v2-preview.html');
writeFileSync(out, doc, 'utf8');
console.log(out);
