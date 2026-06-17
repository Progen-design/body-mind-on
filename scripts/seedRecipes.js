/**
 * scripts/seedRecipes.js
 * Dávkový import ze Spoonacular → recipes_catalog.
 * Pouze při SPOONACULAR_MODE=seed. Budget cap MAX_POINTS (default 400).
 *
 * meal_type se NEPŘIŘAZUJE podle seed bucketu dotazu (Spoonacular fulltext vrací
 * i hlavní jídla na dotaz "protein snack"), ale klasifikátorem
 * scripts/mealTypeClassifier.mjs (OpenAI) — stejná logika jako recategorizeMeals.mjs.
 * Bucket dotazu je jen fallback při selhání klasifikace.
 *
 * Spustit: SPOONACULAR_MODE=seed node scripts/seedRecipes.js
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const MAX_POINTS = Number(process.env.SPOONACULAR_MAX_SEED_POINTS || 400);

/** Cílové počty nových receptů podle meal_type × dieta (uprav dle potřeby). */
const SEED_TARGETS = {
  snidane: { tags: [''], queries: ['oatmeal', 'eggs breakfast', 'yogurt parfait'], perQuery: 12 },
  obed: { tags: [''], queries: ['chicken rice', 'salmon lunch', 'beef stew'], perQuery: 15 },
  vecere: { tags: [''], queries: ['grilled chicken', 'pasta dinner', 'fish vegetables'], perQuery: 12 },
  svacina: { tags: [''], queries: ['protein snack', 'fruit yogurt', 'nuts snack'], perQuery: 8 },
};

const DIET_PASSES = [
  { label: 'standard', diet: '', extraTags: [] },
  { label: 'vegetarian', diet: 'vegetarian', extraTags: ['vegetarian'] },
  { label: 'low_carb', diet: 'low-carb', extraTags: ['low_carb'] },
];

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));

function spoonacularKey() {
  return process.env.SPOONACULAR_API_KEY || '';
}

function getMode() {
  return String(process.env.SPOONACULAR_MODE || 'off').trim().toLowerCase();
}

function readQuotaHeaders(res) {
  const req = Number(res.headers.get('x-api-quota-request') || res.headers.get('X-API-Quota-Request') || 0);
  const used = Number(res.headers.get('x-api-quota-used') || res.headers.get('X-API-Quota-Used') || 0);
  return { req: Number.isFinite(req) ? req : 0, used: Number.isFinite(used) ? used : 0 };
}

function isPermanentStatus(status) {
  return status === 402 || (status >= 400 && status < 500);
}

async function fetchWithRetry(url, opts = {}) {
  const maxAttempts = 3;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
      if (res.ok) return res;
      const body = await res.text().catch(() => '');
      if (isPermanentStatus(res.status)) {
        const err = new Error(`Spoonacular permanent HTTP ${res.status}: ${body.slice(0, 200)}`);
        err.permanent = true;
        throw err;
      }
      if (attempt >= maxAttempts) {
        throw new Error(`Spoonacular HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (e.permanent) throw e;
      lastErr = e;
      if (attempt >= maxAttempts) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastErr || new Error('Spoonacular fetch failed');
}

function nutrientAmount(recipe, name) {
  const list = recipe?.nutrition?.nutrients;
  if (!Array.isArray(list)) return null;
  const hit = list.find((n) => n?.name === name);
  return hit?.amount != null ? Number(hit.amount) : null;
}

function dietTagsFromRecipe(recipe, extra = []) {
  const tags = new Set(extra);
  if (recipe.vegetarian) tags.add('vegetarian');
  if (recipe.vegan) tags.add('vegan');
  if (recipe.glutenFree) tags.add('gluten_free');
  if (recipe.lowFodmap) tags.add('low_fodmap');
  const diets = Array.isArray(recipe.diets) ? recipe.diets : [];
  for (const d of diets) {
    if (String(d).toLowerCase().includes('low carb')) tags.add('low_carb');
  }
  return [...tags];
}

function mapRecipeToCatalogRow(recipe, mealType, extraDietTags) {
  const kcal = Math.round(nutrientAmount(recipe, 'Calories') || Number(recipe.calories) || 0);
  const ingredients = Array.isArray(recipe.extendedIngredients)
    ? recipe.extendedIngredients.map((i) => ({
        original: i.original || i.name,
        name: i.name,
        amount: i.amount,
        unit: i.unit,
      }))
    : null;
  const instructions = Array.isArray(recipe.analyzedInstructions)
    ? recipe.analyzedInstructions.flatMap((b) => (b.steps || []).map((s) => s.step).filter(Boolean))
    : typeof recipe.instructions === 'string'
      ? [recipe.instructions]
      : null;

  return {
    source: 'spoonacular',
    source_id: String(recipe.id),
    name_cs: recipe.title,
    name_en: recipe.title,
    meal_type: mealType,
    kcal: kcal > 0 ? kcal : 300,
    protein_g: nutrientAmount(recipe, 'Protein'),
    carbs_g: nutrientAmount(recipe, 'Carbohydrates'),
    fat_g: nutrientAmount(recipe, 'Fat'),
    diet_tags: dietTagsFromRecipe(recipe, extraDietTags),
    servings: recipe.servings ?? 1,
    ingredients,
    instructions,
    spoonacular_url:
      recipe.sourceUrl ||
      recipe.spoonacularSourceUrl ||
      (recipe.id ? `https://spoonacular.com/recipe/${recipe.id}` : null),
    image_url: recipe.image || null,
    active: true,
  };
}

async function verifySpoonacularKey(apiKey) {
  const url = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${encodeURIComponent(apiKey)}&query=chicken&number=1&addRecipeInformation=false`;
  const res = await fetchWithRetry(url, { headers: { Accept: 'application/json' } });
  const quota = readQuotaHeaders(res);
  const data = JSON.parse(await res.text());
  if (!data || !Array.isArray(data.results)) {
    throw new Error('Ověřovací complexSearch nevrátilo results — klíč nefunkční nebo kvóta.');
  }
  return quota;
}

async function complexSearch(apiKey, query, diet, offset, number) {
  const params = new URLSearchParams({
    apiKey,
    query,
    number: String(number),
    offset: String(offset),
    addRecipeInformation: 'true',
    addRecipeNutrition: 'true',
    instructionsRequired: 'true',
  });
  if (diet) params.set('diet', diet);
  const url = `https://api.spoonacular.com/recipes/complexSearch?${params}`;
  const res = await fetchWithRetry(url, { headers: { Accept: 'application/json' } });
  const quota = readQuotaHeaders(res);
  const data = JSON.parse(await res.text());
  return { results: Array.isArray(data.results) ? data.results : [], quota };
}

let openaiClient = null;
let classifyMealTypesWithOpenAI = null;

async function setupMealTypeClassifier() {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY chybí — meal_type se přiřadí podle seed bucketu (méně přesné).');
    return;
  }
  try {
    const OpenAI = require('openai');
    const mod = await import('./mealTypeClassifier.mjs');
    classifyMealTypesWithOpenAI = mod.classifyMealTypesWithOpenAI;
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch (e) {
    console.warn('Klasifikátor meal_type nelze načíst — fallback na seed bucket:', e.message);
  }
}

async function main() {
  if (getMode() !== 'seed') {
    console.error('seedRecipes.js vyžaduje SPOONACULAR_MODE=seed (aktuálně:', getMode(), ')');
    process.exit(1);
  }
  if (!spoonacularKey()) {
    console.error('Chybí SPOONACULAR_API_KEY');
    process.exit(1);
  }
  const apiKey = spoonacularKey();
  await setupMealTypeClassifier();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  let pointsUsed = 0;
  let saved = 0;
  const byMealType = { snidane: 0, obed: 0, vecere: 0, svacina: 0 };

  console.log('Ověřuji Spoonacular klíč (1× complexSearch)…');
  try {
    const vq = await verifySpoonacularKey(apiKey);
    pointsUsed += vq.req || 1;
    console.log('Klíč OK. Quota used (header):', vq.used || 'n/a');
  } catch (e) {
    console.error('STOP:', e.message);
    console.error('Klíč nefunkční / kvóta vyčerpaná — live seed se nespouští.');
    process.exit(2);
  }

  for (const [mealType, cfg] of Object.entries(SEED_TARGETS)) {
    for (const dietPass of DIET_PASSES) {
      for (const query of cfg.queries) {
        if (pointsUsed >= MAX_POINTS) break;
        let offset = 0;
        let fetchedForQuery = 0;
        while (fetchedForQuery < cfg.perQuery && pointsUsed < MAX_POINTS) {
          const batch = Math.min(25, cfg.perQuery - fetchedForQuery);
          let results;
          try {
            const out = await complexSearch(apiKey, query, dietPass.diet, offset, batch);
            pointsUsed += out.quota.req || 1;
            results = out.results;
          } catch (e) {
            if (e.permanent) {
              console.error('Permanentní chyba — ukončuji seed:', e.message);
              break;
            }
            console.warn('Search skip:', query, e.message);
            break;
          }
          if (!results.length) break;

          // Správný meal_type podle obsahu receptu (ne podle bucketu dotazu).
          let classifiedTypes = new Map();
          if (openaiClient && classifyMealTypesWithOpenAI) {
            try {
              classifiedTypes = await classifyMealTypesWithOpenAI(
                openaiClient,
                results.map((r) => ({
                  id: r.id,
                  name_cs: r.title,
                  name_en: r.title,
                  kcal: nutrientAmount(r, 'Calories'),
                  protein_g: nutrientAmount(r, 'Protein'),
                  carbs_g: nutrientAmount(r, 'Carbohydrates'),
                  fat_g: nutrientAmount(r, 'Fat'),
                }))
              );
            } catch (e) {
              console.warn('Klasifikace meal_type selhala, používám bucket dotazu:', e.message);
            }
          }

          for (const recipe of results) {
            if (pointsUsed >= MAX_POINTS) break;
            const finalMealType = classifiedTypes.get(String(recipe.id)) || mealType;
            const row = mapRecipeToCatalogRow(recipe, finalMealType, dietPass.extraTags);
            const { error } = await supabase
              .from('recipes_catalog')
              .upsert(row, { onConflict: 'source,source_id' });
            if (!error) {
              saved++;
              byMealType[finalMealType] = (byMealType[finalMealType] || 0) + 1;
            }
            fetchedForQuery++;
          }
          offset += results.length;
          if (results.length < batch) break;
        }
      }
    }
  }

  const { count } = await supabase.from('recipes_catalog').select('*', { count: 'exact', head: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        saved_this_run: saved,
        catalog_total: count,
        by_meal_type_this_run: byMealType,
        points_used_estimate: pointsUsed,
        max_points: MAX_POINTS,
        note: 'name_cs = name_en po seedu; spusť node scripts/translateRecipesCatalog.mjs',
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
