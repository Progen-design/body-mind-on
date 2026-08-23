#!/usr/bin/env node
/**
 * One-shot probe: Spoonacular quota headers + sample recipe structure.
 * Does NOT print the API key. Does NOT write to DB.
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const key = process.env.SPOONACULAR_API_KEY || '';
const sampleId = process.argv[2] || '715538';

const out = {
  has_key: Boolean(key),
  key_length: key.length,
  spoonacular_mode: process.env.SPOONACULAR_MODE || null,
  sample_id: sampleId,
};

if (!key) {
  console.log(JSON.stringify({ ...out, error: 'SPOONACULAR_API_KEY missing in local env' }, null, 2));
  process.exit(2);
}

const url = `https://api.spoonacular.com/recipes/${encodeURIComponent(sampleId)}/information?includeNutrition=true&apiKey=${encodeURIComponent(key)}`;
const res = await fetch(url, {
  headers: { Accept: 'application/json' },
  signal: AbortSignal.timeout(30000),
});

const headers = {};
for (const h of [
  'x-api-quota-request',
  'x-api-quota-used',
  'x-api-quota-left',
  'x-ratelimit-requests-remaining',
  'x-ratelimit-requests-limit',
  'x-ratelimit-points-remaining',
  'x-ratelimit-points-limit',
]) {
  const v = res.headers.get(h);
  if (v != null) headers[h] = v;
}

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = { parse_error: true, text_preview: text.slice(0, 300) };
}

out.http_status = res.status;
out.quota_headers = headers;

if (!res.ok) {
  out.error_body = typeof body === 'object' ? {
    code: body.code,
    message: body.message,
    status: body.status,
  } : String(body).slice(0, 200);
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

const nutrients = Array.isArray(body?.nutrition?.nutrients) ? body.nutrition.nutrients : [];
const pickNutrient = (name) => {
  const n = nutrients.find((x) => String(x?.name || '').toLowerCase() === name.toLowerCase());
  return n ? { name: n.name, amount: n.amount, unit: n.unit } : null;
};

const firstIngs = (Array.isArray(body.extendedIngredients) ? body.extendedIngredients : []).slice(0, 3).map((ing) => ({
  name: ing.name,
  amount: ing.amount,
  unit: ing.unit,
  measures_metric: ing.measures?.metric || null,
  measures_us: ing.measures?.us
    ? { amount: ing.measures.us.amount, unitShort: ing.measures.us.unitShort }
    : null,
  original: ing.original,
}));

const nutritionIngredientsSample = (Array.isArray(body?.nutrition?.ingredients) ? body.nutrition.ingredients : [])
  .slice(0, 2)
  .map((ing) => ({
    id: ing.id,
    name: ing.name,
    amount: ing.amount,
    unit: ing.unit,
    nutrients: (ing.nutrients || [])
      .filter((n) => ['Calories', 'Protein', 'Carbohydrates', 'Fat'].includes(n.name))
      .map((n) => ({ name: n.name, amount: n.amount, unit: n.unit })),
  }));

out.recipe = {
  id: body.id,
  title: body.title,
  servings: body.servings,
  readyInMinutes: body.readyInMinutes,
  extendedIngredients_count: Array.isArray(body.extendedIngredients) ? body.extendedIngredients.length : 0,
  extendedIngredients_sample: firstIngs,
  nutrition_nutrients_key: {
    Calories: pickNutrient('Calories'),
    Protein: pickNutrient('Protein'),
    Carbohydrates: pickNutrient('Carbohydrates'),
    Fat: pickNutrient('Fat'),
  },
  nutrition_ingredients_count: Array.isArray(body?.nutrition?.ingredients)
    ? body.nutrition.ingredients.length
    : 0,
  nutrition_ingredients_sample: nutritionIngredientsSample,
};

const dumpPath = resolve(process.cwd(), 'scripts/_tmp-spoonacular-sample.json');
writeFileSync(dumpPath, JSON.stringify({
  quota_headers: headers,
  http_status: res.status,
  recipe_id: body.id,
  title: body.title,
  servings: body.servings,
  extendedIngredients_sample: firstIngs,
  nutrition_nutrients_key: out.recipe.nutrition_nutrients_key,
  nutrition_ingredients_sample: nutritionIngredientsSample,
}, null, 2), 'utf8');
out.saved_sample_file = 'scripts/_tmp-spoonacular-sample.json';

console.log(JSON.stringify(out, null, 2));
