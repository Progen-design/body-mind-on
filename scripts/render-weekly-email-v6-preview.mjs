import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
process.chdir(repoRoot);

const { buildWeeklyPlanEmailV6Document } = await import('../lib/weeklyPlanEmailV6.js');

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

function auditChecks(label, html) {
  const issues = [];
  const placeholders = html.match(/\{\{[a-zA-Z_0-9]+\}\}/g);
  if (placeholders) issues.push(`leftover placeholders: ${[...new Set(placeholders)].join(', ')}`);
  if (/<script[^a-z]/i.test(html)) issues.push('contains raw <script>');
  if (!/target="_blank"/.test(html)) issues.push('no target=_blank on links');
  if (/background-clip\s*:\s*text/i.test(html)) issues.push('background-clip:text present (forbidden in v6)');
  if (/text-shadow/i.test(html)) issues.push('text-shadow present (forbidden in v6)');
  if (/linear-gradient|radial-gradient/i.test(html)) issues.push('CSS gradient present (forbidden in v6; gradients live in PNG)');
  if (/display\s*:\s*flex|display\s*:\s*grid/i.test(html)) issues.push('flex/grid present');
  // transform check must not flag legitimate text-transform: uppercase
  if (/(^|[^-])transform\s*:(?!\s*uppercase|\s*lowercase|\s*capitalize|\s*none)/i.test(html)) issues.push('transform present');
  if (/#FFFFFF/i.test(html)) issues.push('#FFFFFF used (prefer #F0EBFF)');
  if (/#000000/.test(html)) issues.push('#000000 used (prefer #0A0815)');

  // bgcolor coverage – every <td style*="background-color"> should have a bgcolor attr too.
  const tdStyledBg = (html.match(/<td[^>]*style="[^"]*background-color:[^"]*"/g) || []);
  const tdMissingBgcolor = tdStyledBg.filter((m) => !/bgcolor=/.test(m));
  if (tdMissingBgcolor.length) {
    issues.push(`<td> with background-color but no bgcolor attr: ${tdMissingBgcolor.length}`);
  }
  // every <img> must have alt + width + height + style
  const imgs = html.match(/<img\b[^>]*>/g) || [];
  for (const tag of imgs) {
    if (!/alt="[^"]+"/.test(tag)) issues.push(`<img> missing alt: ${tag.slice(0, 80)}`);
    if (!/\bwidth="\d+"/.test(tag)) issues.push(`<img> missing width attr: ${tag.slice(0, 80)}`);
    if (!/\bheight="\d+"/.test(tag)) issues.push(`<img> missing height attr: ${tag.slice(0, 80)}`);
  }
  // image src must be absolute (https in production, http://localhost OK in local preview)
  const imgSrcs = [...html.matchAll(/<img[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  for (const src of imgSrcs) {
    if (!/^https?:\/\//.test(src)) issues.push(`<img src> is not absolute: ${src}`);
  }

  const sizeKb = Math.round(html.length / 102.4) / 10;
  if (html.length > 81920) issues.push(`above 80 KB target: ${sizeKb} KB`);
  const emDashes = (html.match(/—/g) || []).length;
  const mark = issues.length === 0 ? 'OK ' : 'FAIL';
  console.log(`${mark} ${label.padEnd(28)} ${sizeKb.toString().padStart(6)} KB · imgs=${imgs.length} · em-dash=${emDashes}${issues.length ? '\n     - ' + issues.join('\n     - ') : ''}`);
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
console.log('--- v6 PREVIEW AUDIT ---');
for (const v of variants) {
  const planJson = buildPlan(v);
  const html = buildWeeklyPlanEmailV6Document({
    structuredPlanJson: planJson,
    bodyMetrics: { height_cm: 195, weight_kg: 95, goal: v.goal },
    firstName: v.firstName,
    assetBaseUrl: 'http://localhost:8766',
  });
  const outPath = join(tmp, `body-mind-on-weekly-plan-email-v6-${v.label}.html`);
  writeFileSync(outPath, html, 'utf8');
  auditChecks(v.label, html);
  console.log(`     → ${outPath}`);
}

console.log('\nDone.');
