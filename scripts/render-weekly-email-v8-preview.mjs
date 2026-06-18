import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
process.chdir(repoRoot);

const { buildWeeklyPlanEmailV8Document } = await import('../lib/weeklyPlanEmailV8.js');

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
    : makeMeal('breakfast', `Vaječná míchanice ${index + 1}`, 1000 + index, { protein: 7, carbs: 41, fat: 7, fiber: 6, calories: 320 });
  const lunch = opts.allUnverified
    ? makeMeal('lunch', 'Grilované kuře s rýží', 2000 + index, {}, false)
    : makeMeal('lunch', `Grilované kuře s rýží ${index + 1}`, 2000 + index, { protein: 29, carbs: 55, fat: 8, fiber: 6, calories: 420 });
  const dinner = opts.allUnverified
    ? makeMeal('dinner', 'Tuňákový salát', 3000 + index, {}, false)
    : makeMeal('dinner', `Tuňákový salát ${index + 1}`, 3000 + index, { protein: 31, carbs: 4, fat: 20, fiber: 1, calories: 280 });

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
            { name: 'Shyby', sets: 4, reps: 10 },
            { name: 'Veslování', sets: 3, reps: 12 },
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
  } else if (index === 5) {
    workout = {
      intensity: 'easy',
      exercises: [
        { name: 'Chůze', sets: 1, reps: 30 },
        { name: 'Strečink', sets: 1, duration_seconds: 600 },
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

// 10-point audit (same contract as v7 preview).
function auditChecks(label, html) {
  const issues = [];
  const placeholders = html.match(/\{\{[a-zA-Z_0-9]+\}\}/g);
  if (placeholders) issues.push(`leftover placeholders: ${[...new Set(placeholders)].join(', ')}`);
  if (/<script[^a-z]/i.test(html)) issues.push('contains raw <script>');

  const imgs = html.match(/<img\b[^>]*>/g) || [];
  if (imgs.length > 0) issues.push(`<img> tags present: ${imgs.length}`);
  if (/\.png|\.jpg|\.jpeg|\.webp/i.test(html)) issues.push('PNG/JPG/WEBP reference in HTML');

  if (!/'Inter'/.test(html)) issues.push("'Inter' font missing");
  if (/Geist/.test(html)) issues.push('Geist font reference present');

  const diacriticsExpected = ['Tvůj', 'týden', 'Pondělí', 'připraven'];
  for (const word of diacriticsExpected) {
    if (!html.includes(word)) issues.push(`missing diacritic word: "${word}"`);
  }

  for (const day of ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle']) {
    if (!html.includes(day)) issues.push(`day name missing: ${day}`);
  }

  if (!/border-radius:16/.test(html)) issues.push('border-radius:16 missing');
  if (!/border-radius:12/.test(html)) issues.push('border-radius:12 missing');
  if (!/border-radius:10/.test(html)) issues.push('border-radius:10 missing');
  if (!/border-radius:10/.test(html)) issues.push('border-radius:10 missing');
  if (!/border-radius:999/.test(html)) issues.push('border-radius:999 missing');

  if (!/max-width:840/.test(html)) issues.push('max-width:840 missing');
  if (!/@media only screen and \(max-width:640px\)/.test(html)) issues.push('mobile media query @640px missing');

  if (/background-clip\s*:\s*text/i.test(html)) issues.push('background-clip:text present');
  if (/text-shadow/i.test(html)) issues.push('text-shadow present');
  if (/(^|[^-])transform\s*:(?!\s*uppercase|\s*lowercase|\s*capitalize|\s*none)/i.test(html)) issues.push('transform present');
  if (/display\s*:\s*flex|display\s*:\s*grid/i.test(html)) issues.push('flex/grid present');

  const tdStyledBg = (html.match(/<td[^>]*style="[^"]*background-color:[^"]*"/g) || []);
  const tdMissingBgcolor = tdStyledBg.filter((m) => !/bgcolor=/.test(m));
  if (tdMissingBgcolor.length) {
    issues.push(`<td> with background-color but no bgcolor attr: ${tdMissingBgcolor.length}`);
  }

  const sizeKb = Math.round(html.length / 102.4) / 10;
  if (html.length > 153600) issues.push(`above 150 KB target: ${sizeKb} KB`);

  const ordinals = ['První', 'Druhý', 'Třetí', 'Čtvrtý', 'Pátý', 'Šestý', 'Sedmý'];
  for (const ord of ordinals) {
    if (!html.includes(ord)) issues.push(`day ordinal missing: ${ord}`);
  }

  if (!/target="_blank"/.test(html)) issues.push('no target=_blank on links');

  // v8: six compact day headers use day-compact-mobile; day 1 uses day-name-mobile.
  const compactHeaders = (html.match(/class="day-compact-mobile"/g) || []).length;
  if (compactHeaders !== 6) issues.push(`expected 6 compact day headers (day-compact-mobile), found ${compactHeaders}`);

  const fullDayHeaders = (html.match(/class="day-name-mobile"/g) || []).length;
  if (fullDayHeaders !== 1) issues.push(`expected 1 full day header (day-name-mobile), found ${fullDayHeaders}`);

  const mark = issues.length === 0 ? 'OK ' : 'FAIL';
  console.log(`${mark} ${label.padEnd(28)} ${sizeKb.toString().padStart(6)} KB · imgs=${imgs.length}${issues.length ? '\n     - ' + issues.join('\n     - ') : ''}`);
  return issues.length === 0;
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
const localPreviewDir = join(repoRoot, 'tmp');
mkdirSync(localPreviewDir, { recursive: true });
console.log('--- v8 PREVIEW AUDIT ---');
let allOk = true;
let primaryPreviewPath = null;
for (const v of variants) {
  const planJson = buildPlan(v);
  const html = buildWeeklyPlanEmailV8Document({
    structuredPlanJson: planJson,
    bodyMetrics: { height_cm: 195, weight_kg: 95, goal: v.goal, activity: 'Střední', weekly_sessions_user: 4 },
    firstName: v.firstName,
  });
  const outPath = join(tmp, `body-mind-on-weekly-plan-email-v8-${v.label}.html`);
  writeFileSync(outPath, html, 'utf8');
  if (v.label === 'muscle_gain-Jan') {
    primaryPreviewPath = join(localPreviewDir, 'email-preview-bodymindon.html');
    writeFileSync(primaryPreviewPath, html, 'utf8');
  }
  const ok = auditChecks(v.label, html);
  if (!ok) allOk = false;
  console.log(`     → ${outPath}`);
}

console.log(`\n${allOk ? 'ALL VARIANTS PASS' : 'SOME VARIANTS FAIL'}`);
if (primaryPreviewPath) console.log(`Local preview: ${primaryPreviewPath}`);
process.exit(allOk ? 0 : 1);
