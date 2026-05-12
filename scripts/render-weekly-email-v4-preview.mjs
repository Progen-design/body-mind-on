import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
process.chdir(repoRoot);

const { buildWeeklyPlanEmailV4Document } = await import('../lib/weeklyPlanEmailV4.js');

function makeMeal(type, title, recipeId, macros, verified = true) {
  return {
    type,
    name_cs: title,
    recipe_id: recipeId,
    recipe_verified: verified,
    recipe: {
      id: recipeId,
      title,
      sourceUrl: `https://example.com/recipe/${recipeId}`,
      protein_g: macros.protein,
      carbs_g: macros.carbs,
      fat_g: macros.fat,
      fiber_g: macros.fiber,
      calories: macros.calories,
    },
  };
}

function dayBlock(index, dayName, isoDate, opts) {
  const breakfast = opts.allUnverified
    ? makeMeal('breakfast', 'Vaječná míchanice', 1000 + index, {}, false)
    : makeMeal('breakfast', 'Vaječná míchanice', 1000 + index, { protein: 7, carbs: 41, fat: 7, fiber: 6, calories: 320 });
  const lunch = opts.allUnverified
    ? makeMeal('lunch', 'Grilované kuře s rýží', 2000 + index, {}, false)
    : makeMeal('lunch', 'Grilované kuře s rýží', 2000 + index, { protein: 29, carbs: 55, fat: 8, fiber: 6, calories: 420 });
  const dinner = opts.allUnverified
    ? makeMeal('dinner', 'Tuňákový salát', 3000 + index, {}, false)
    : makeMeal('dinner', 'Tuňákový salát', 3000 + index, { protein: 31, carbs: 4, fat: 20, fiber: 1, calories: 280 });

  return {
    day_index: index + 1,
    day_name: dayName,
    date: isoDate,
    meals: [breakfast, lunch, dinner],
    workout: index === 0 || index === 3 ? {
      exercises: [
        { name: 'Dřepy', sets: 3, reps: 12 },
        { name: 'Kliky', sets: 3, reps: 10 },
        { name: 'Prkno', sets: 3, duration_seconds: 30 },
      ],
    } : null,
  };
}

function buildPlan(opts) {
  const dayNames = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
  const startIso = '2026-05-11';
  const days = dayNames.map((name, i) => {
    const date = new Date(`${startIso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);
    return dayBlock(i, name, iso, opts);
  });
  return {
    valid_from: startIso,
    goal: opts.goal || 'muscle_gain',
    targets: {
      calories_per_day: 3000,
      protein_g: 200,
      carbs_g: 350,
      fat_g: 80,
    },
    habits: [
      { title: 'Drž se plánu.', description: 'Když nebudeš vědět, co dělat, podívej se sem. Cokoliv je tady, je správně.' },
      { title: 'Odpočívej mezi tréninky.', description: 'Svaly nerostou v posilovně. Rostou, když spíš. Dej tělu prostor.' },
      { title: 'Dodržuj pitný režim.', description: 'Tři litry vody. Bez kompromisu. Tělo to potřebuje.' },
    ],
    days,
  };
}

const variants = [
  { label: 'verified-muscle-gain-Jan', firstName: 'Jan', goal: 'muscle_gain', allUnverified: false },
  { label: 'verified-weight-loss-Eva', firstName: 'Eva', goal: 'weight_loss', allUnverified: false },
  { label: 'unverified-fallback-Tomáš', firstName: 'Tomáš', goal: 'maintenance', allUnverified: true },
];

const tmpDir = tmpdir();
const outputs = [];
for (const v of variants) {
  const planJson = buildPlan({ goal: v.goal, allUnverified: v.allUnverified });
  const html = buildWeeklyPlanEmailV4Document({
    structuredPlanJson: planJson,
    bodyMetrics: { height_cm: 195, weight_kg: 95, goal: v.goal },
    firstName: v.firstName,
  });
  const outPath = join(tmpDir, `body-mind-on-weekly-plan-email-v4-${v.label}.html`);
  writeFileSync(outPath, html, 'utf8');
  outputs.push({ label: v.label, path: outPath, bytes: html.length });
  console.log(`${v.label.padEnd(34)} -> ${outPath} (${html.length} B)`);
}

console.log('\nDone.');
