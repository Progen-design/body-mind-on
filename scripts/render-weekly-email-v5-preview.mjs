import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
process.chdir(repoRoot);

const { buildWeeklyPlanEmailV5Document } = await import('../lib/weeklyPlanEmailV5.js');

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

  let workout = null;
  if (opts.workoutMode === 'rest_all') {
    workout = null;
  } else if (opts.workoutMode === 'hard_first') {
    workout = index === 0
      ? {
          intensity: 'hard',
          exercises: [
            { name: 'Dřepy', sets: 5, reps: 8 },
            { name: 'Mrtvý tah', sets: 5, reps: 5 },
            { name: 'Bench press', sets: 4, reps: 8 },
          ],
        }
      : null;
  } else if (index === 0 || index === 3) {
    workout = {
      intensity: 'medium',
      exercises: [
        { name: 'Dřepy', sets: 3, reps: 12 },
        { name: 'Kliky', sets: 3, reps: 10 },
        { name: 'Prkno', sets: 3, duration_seconds: 30 },
      ],
    };
  }

  return {
    day_index: index + 1,
    day_name: dayName,
    date: isoDate,
    meals: [breakfast, lunch, dinner],
    workout,
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

function audit(label, html) {
  const issues = [];
  const placeholders = html.match(/\{\{[a-zA-Z_0-9]+\}\}/g);
  if (placeholders) issues.push(`leftover placeholders: ${[...new Set(placeholders)].join(', ')}`);
  if (html.includes('<script')) issues.push('contains <script>');
  if (!/target="_blank"/.test(html)) issues.push('no target=_blank on links');
  const sizeKb = Math.round(html.length / 102.4) / 10;
  if (html.length > 102400) issues.push(`gmail clip risk: ${sizeKb} KB`);
  const emDashes = (html.match(/—/g) || []).length;
  const sentMark = issues.length === 0 ? 'OK ' : 'FAIL';
  console.log(`${sentMark} ${label.padEnd(36)} ${sizeKb.toString().padStart(6)} KB · em-dashes: ${emDashes}${issues.length ? '\n     - ' + issues.join('\n     - ') : ''}`);
}

const xssName = 'Test<script>alert(1)</script>';

const variants = [
  { label: 'muscle_gain-Jan', firstName: 'Jan', goal: 'muscle_gain', allUnverified: false, workoutMode: 'medium_default' },
  { label: 'weight_loss-Eva', firstName: 'Eva', goal: 'weight_loss', allUnverified: false, workoutMode: 'medium_default' },
  { label: 'maintenance-Tomáš', firstName: 'Tomáš', goal: 'maintenance', allUnverified: false, workoutMode: 'medium_default' },
  { label: 'endurance-hard', firstName: 'Anna', goal: 'endurance', allUnverified: false, workoutMode: 'hard_first' },
  { label: 'rest_day-edge', firstName: 'Marie', goal: 'muscle_gain', allUnverified: false, workoutMode: 'rest_all' },
  { label: 'xss-escape-test', firstName: xssName, goal: 'muscle_gain', allUnverified: false, workoutMode: 'medium_default' },
  { label: 'unverified-fallback', firstName: 'Mike', goal: 'muscle_gain', allUnverified: true, workoutMode: 'medium_default' },
];

const tmp = tmpdir();
console.log('--- v5 PREVIEW AUDIT ---');
for (const v of variants) {
  const planJson = buildPlan(v);
  const html = buildWeeklyPlanEmailV5Document({
    structuredPlanJson: planJson,
    bodyMetrics: { height_cm: 195, weight_kg: 95, goal: v.goal },
    firstName: v.firstName,
  });
  const outPath = join(tmp, `body-mind-on-weekly-plan-email-v5-${v.label}.html`);
  writeFileSync(outPath, html, 'utf8');
  audit(v.label, html);
  console.log(`     → ${outPath}`);
}

console.log('\nDone.');
