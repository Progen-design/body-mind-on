import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
process.chdir(repoRoot);

const { buildWeeklyPlanEmailV7Document } = await import('../lib/weeklyPlanEmailV7.js');

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

// 10-point audit (v7 specific):
// 1. NO PNG/JPG images (pure HTML)
// 2. Inter font present, no Geist
// 3. Czech diacritics present (TVŮJ, TÝDEN, Začínáme, Pondělí…)
// 4. All 7 day names present
// 5. border-radius: 16/12/10/8/999 all present
// 6. max-width:540 present
// 7. No background-clip:text, no text-shadow
// 8. Every <td> with background-color also has bgcolor attr
// 9. HTML size < 150 KB
// 10. Day ordinals (První-Sedmý) all present
function auditChecks(label, html) {
  const issues = [];
  const placeholders = html.match(/\{\{[a-zA-Z_0-9]+\}\}/g);
  if (placeholders) issues.push(`leftover placeholders: ${[...new Set(placeholders)].join(', ')}`);
  if (/<script[^a-z]/i.test(html)) issues.push('contains raw <script>');

  // 1. NO PNG/JPG
  const imgs = html.match(/<img\b[^>]*>/g) || [];
  if (imgs.length > 0) issues.push(`<img> tags present: ${imgs.length} (forbidden in v7)`);
  if (/\.png|\.jpg|\.jpeg|\.webp/i.test(html)) issues.push('PNG/JPG/WEBP reference in HTML (forbidden in v7)');

  // 2. Inter font + no Geist
  if (!/'Inter'/.test(html)) issues.push("'Inter' font missing");
  // Geist may appear only in plan content; check it does not appear in HTML at all
  if (/Geist/.test(html)) issues.push('Geist font reference present (use Inter only)');

  // 3. Czech diacritics
  const diacriticsExpected = ['Tvůj', 'týden', 'Začínáme', 'Pondělí', 'máš'];
  for (const word of diacriticsExpected) {
    if (!html.includes(word)) issues.push(`missing diacritic word: "${word}"`);
  }

  // 4. All 7 day names
  for (const day of ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle']) {
    if (!html.includes(day)) issues.push(`day name missing: ${day}`);
  }

  // 5. border-radius
  if (!/border-radius:16/.test(html)) issues.push('border-radius:16 missing (cards)');
  if (!/border-radius:12/.test(html)) issues.push('border-radius:12 missing (meal cards)');
  if (!/border-radius:10/.test(html)) issues.push('border-radius:10 missing (macros)');
  if (!/border-radius:8/.test(html)) issues.push('border-radius:8 missing (buttons)');
  if (!/border-radius:999/.test(html)) issues.push('border-radius:999 missing (pills)');

  // 6. max-width 540
  if (!/max-width:540/.test(html)) issues.push('max-width:540 missing');

  // 7. forbidden CSS
  if (/background-clip\s*:\s*text/i.test(html)) issues.push('background-clip:text present (forbidden)');
  if (/text-shadow/i.test(html)) issues.push('text-shadow present (forbidden)');
  if (/(^|[^-])transform\s*:(?!\s*uppercase|\s*lowercase|\s*capitalize|\s*none)/i.test(html)) issues.push('transform present (forbidden)');
  if (/display\s*:\s*flex|display\s*:\s*grid/i.test(html)) issues.push('flex/grid present');

  // 8. bgcolor coverage
  const tdStyledBg = (html.match(/<td[^>]*style="[^"]*background-color:[^"]*"/g) || []);
  const tdMissingBgcolor = tdStyledBg.filter((m) => !/bgcolor=/.test(m));
  if (tdMissingBgcolor.length) {
    issues.push(`<td> with background-color but no bgcolor attr: ${tdMissingBgcolor.length}`);
  }

  // 9. HTML size < 150 KB
  const sizeKb = Math.round(html.length / 102.4) / 10;
  if (html.length > 153600) issues.push(`above 150 KB target: ${sizeKb} KB`);

  // 10. Day ordinals
  const ordinals = ['První', 'Druhý', 'Třetí', 'Čtvrtý', 'Pátý', 'Šestý', 'Sedmý'];
  for (const ord of ordinals) {
    if (!html.includes(ord)) issues.push(`day ordinal missing: ${ord}`);
  }

  // links
  if (!/target="_blank"/.test(html)) issues.push('no target=_blank on links');

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
console.log('--- v7 PREVIEW AUDIT (10-point) ---');
let allOk = true;
for (const v of variants) {
  const planJson = buildPlan(v);
  const html = buildWeeklyPlanEmailV7Document({
    structuredPlanJson: planJson,
    bodyMetrics: { height_cm: 195, weight_kg: 95, goal: v.goal },
    firstName: v.firstName,
  });
  const outPath = join(tmp, `body-mind-on-weekly-plan-email-v7-${v.label}.html`);
  writeFileSync(outPath, html, 'utf8');
  const ok = auditChecks(v.label, html);
  if (!ok) allOk = false;
  console.log(`     → ${outPath}`);
}

console.log(`\n${allOk ? 'ALL VARIANTS PASS' : 'SOME VARIANTS FAIL'}`);
process.exit(allOk ? 0 : 1);
