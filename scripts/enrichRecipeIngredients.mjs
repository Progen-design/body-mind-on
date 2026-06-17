#!/usr/bin/env node
/**
 * scripts/enrichRecipeIngredients.mjs
 * Jednorázové doplnění surovin (ingredients) do recipes_catalog.
 * ŽÁDNÉ živé Spoonacular volání v plánovací cestě — jen tento batch skript.
 *
 * Tvar zápisu (KROK 0 — co konzumenti čtou):
 *   ingredients = [{ original: "200 g kuřecí prsa", name: "kuřecí prsa", amount: 200, unit: "g" }, ...]
 *   - lib/recipesCatalog.js ingredientLinesFromCatalogRow čte i.original || i.name || i.text
 *     → shopping_ingredient_lines (nákupní seznam, Rohlík) — proto original ČESKY.
 *   - lib/mealPortionIngredients.js čte {name, amount, unit} (+ servings) — stejný tvar.
 *
 * Větve:
 *   A) source='spoonacular' + numerické source_id → GET /recipes/informationBulk
 *      (úsporné na kvótu, až 25 id/volání) → extendedIngredients → překlad do češtiny přes OpenAI.
 *      Vyžaduje SPOONACULAR_MODE=seed (stejná brána jako seedRecipes.js). Při mrtvém klíči /
 *      vyčerpané kvótě (402) automaticky fallback na OpenAI generování (nahlásí se).
 *   B) source='meal_cache' (textové source_id) → OpenAI vygeneruje suroviny česky
 *      z name_cs + kcal + maker. Striktní JSON, stejný tvar jako A.
 *
 * DEFAULT = DRY-RUN: vzorek 5×A + 5×B, vypíše výsledný tvar + odhad volání. NIC nezapisuje.
 *   node scripts/enrichRecipeIngredients.mjs
 * Plný zápis (idempotentní — jen řádky s chybějícími ingredients):
 *   SPOONACULAR_MODE=seed node scripts/enrichRecipeIngredients.mjs --apply
 * Volitelně: --limit N (omezí počet zpracovaných receptů, pro dávkování po dnech).
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const APPLY = process.argv.includes('--apply');
const limitArgIdx = process.argv.indexOf('--limit');
const LIMIT = limitArgIdx > -1 ? Math.max(1, Number(process.argv[limitArgIdx + 1]) || 0) : null;
const DRY_RUN_SAMPLE_PER_BRANCH = 5;
const BULK_CHUNK = 25; // informationBulk max id/volání
const OPENAI_CHUNK = 5; // receptů na jedno OpenAI volání (překlad i generování)

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  break;
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('Chybí OPENAI_API_KEY (nutné pro překlad i větev B)');
  process.exit(1);
}

const supabase = createClient(url, key);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OPENAI_MODEL = process.env.INGREDIENT_ENRICH_MODEL || 'gpt-4o-mini';

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';
const SPOONACULAR_MODE = String(process.env.SPOONACULAR_MODE || 'off').trim().toLowerCase();

const stats = {
  spoonacular_calls: 0,
  spoonacular_quota_used_header: null,
  openai_calls: 0,
  branch_a_via_spoonacular: 0,
  branch_a_via_openai_fallback: 0,
  branch_b_via_openai: 0,
  updated: 0,
  failed: 0,
  skipped_no_result: 0,
};
let spoonacularDead = false;

function hasIngredients(row) {
  return Array.isArray(row.ingredients) && row.ingredients.length > 0;
}

function isBranchA(row) {
  return row.source === 'spoonacular' && /^\d+$/.test(String(row.source_id || ''));
}

/** Normalizace výstupu na cílový tvar; vyhodí nevalidní položky. */
function normalizeIngredients(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((i) => {
      const ingName = String(i?.name || '').trim();
      if (!ingName) return null;
      const amount = i?.amount != null && Number.isFinite(Number(i.amount)) ? Number(i.amount) : null;
      const unit = String(i?.unit || '').trim();
      const original = String(i?.original || '').trim()
        || [amount != null ? String(amount) : '', unit, ingName].filter(Boolean).join(' ');
      return { original, name: ingName, amount, unit };
    })
    .filter(Boolean)
    .slice(0, 28);
}

async function fetchSpoonacularBulk(ids) {
  const u = `https://api.spoonacular.com/recipes/informationBulk?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&ids=${ids.join(',')}&includeNutrition=false`;
  const res = await fetch(u, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  stats.spoonacular_calls++;
  const quotaUsed = res.headers.get('x-api-quota-used');
  if (quotaUsed) stats.spoonacular_quota_used_header = quotaUsed;
  const body = await res.text().catch(() => '');
  if (!res.ok) {
    if (res.status === 402 || res.status === 401 || res.status === 429) {
      spoonacularDead = true;
      console.warn(`⚠️ Spoonacular HTTP ${res.status} — kvóta/klíč. Zbytek větve A pojede přes OpenAI fallback.`);
      return null;
    }
    console.warn(`Spoonacular informationBulk HTTP ${res.status}: ${body.slice(0, 200)}`);
    return null;
  }
  try {
    const data = JSON.parse(body);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Větev A: překlad anglických extendedIngredients do češtiny (chunk receptů na 1 volání).
 * @param {Array<{id: number, name_en: string, ingredientsEn: Array<{name: string, amount: number|null, unit: string}>}>} recipes
 * @returns {Promise<Map<string, Array>>} id → normalizované české ingredients
 */
async function translateIngredientsCs(recipes) {
  const out = new Map();
  for (let i = 0; i < recipes.length; i += OPENAI_CHUNK) {
    const chunk = recipes.slice(i, i + OPENAI_CHUNK);
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      max_tokens: 3500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Překládáš ingredience receptů do češtiny pro nákupní seznam (Rohlík.cz).
Pro každý recept vrať pole ingrediencí. U každé ingredience:
- "name": český název suroviny (1. pád, běžný obchodní název, např. "kuřecí prsa", "olivový olej"),
- "amount": číslo (převedeno na metrické jednotky, kde to dává smysl: cup→ml/g, tbsp→lžíce, oz→g),
- "unit": česká jednotka ("g", "ml", "ks", "lžíce", "lžička", "hrnek", "stroužek", "plechovka", "" pokud bez jednotky),
- "original": celý český řádek pro nákupní seznam, např. "200 g kuřecích prsou" nebo "1 lžíce olivového oleje".
Odpověz POUZE validním JSON: {"results":[{"id":<id>,"ingredients":[{...}]}]} — stejná id jako vstup.`,
        },
        { role: 'user', content: JSON.stringify({ recipes: chunk.map((r) => ({ id: r.id, title_en: r.name_en, ingredients_en: r.ingredientsEn })) }) },
      ],
    });
    stats.openai_calls++;
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      for (const res of parsed?.results || []) {
        const norm = normalizeIngredients(res?.ingredients);
        if (res?.id != null && norm.length) out.set(String(res.id), norm);
      }
    } catch {
      /* chunk skip */
    }
  }
  return out;
}

/**
 * Větev B (a fallback A): OpenAI vygeneruje suroviny česky z názvu + maker (1 porce).
 * @param {Array<{id: number, name_cs: string, kcal: number|null, protein_g: number|null, carbs_g: number|null, fat_g: number|null}>} recipes
 * @returns {Promise<Map<string, Array>>}
 */
async function generateIngredientsCs(recipes) {
  const out = new Map();
  for (let i = 0; i < recipes.length; i += OPENAI_CHUNK) {
    const chunk = recipes.slice(i, i + OPENAI_CHUNK);
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      max_tokens: 3500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Jsi nutriční asistent. Pro každý recept vygeneruj realistický seznam surovin na 1 PORCI,
konzistentní s uvedenými kcal a makry (bílkoviny/sacharidy/tuky). 4–10 surovin, ČESKY.
U každé suroviny:
- "name": český název (1. pád, běžný obchodní název),
- "amount": číslo v metrických jednotkách,
- "unit": česká jednotka ("g", "ml", "ks", "lžíce", "lžička", "stroužek", "" pokud bez jednotky),
- "original": celý český řádek pro nákupní seznam, např. "60 g ovesných vloček".
Odpověz POUZE validním JSON: {"results":[{"id":<id>,"ingredients":[{...}]}]} — stejná id jako vstup.`,
        },
        { role: 'user', content: JSON.stringify({ recipes: chunk }) },
      ],
    });
    stats.openai_calls++;
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      for (const res of parsed?.results || []) {
        const norm = normalizeIngredients(res?.ingredients);
        if (res?.id != null && norm.length) out.set(String(res.id), norm);
      }
    } catch {
      /* chunk skip */
    }
  }
  return out;
}

/** Větev A přes Spoonacular: vrátí Map id → { ingredients, image_url } (po českém překladu). */
async function enrichBranchAViaSpoonacular(rows) {
  const result = new Map();
  if (!rows.length) return result;

  for (let i = 0; i < rows.length && !spoonacularDead; i += BULK_CHUNK) {
    const chunk = rows.slice(i, i + BULK_CHUNK);
    const byId = new Map(chunk.map((r) => [String(r.source_id), r]));
    const bulk = await fetchSpoonacularBulk(chunk.map((r) => r.source_id));
    if (!bulk) continue;

    const toTranslate = [];
    for (const recipe of bulk) {
      const row = byId.get(String(recipe?.id));
      if (!row) continue;
      const ext = Array.isArray(recipe.extendedIngredients) ? recipe.extendedIngredients : [];
      if (!ext.length) continue;
      toTranslate.push({
        id: row.id,
        name_en: row.name_en || recipe.title || '',
        image: recipe.image || null,
        ingredientsEn: ext.slice(0, 28).map((ing) => ({
          name: String(ing?.name || ing?.originalName || '').trim(),
          amount: ing?.amount != null && Number.isFinite(Number(ing.amount)) ? Number(ing.amount) : null,
          unit: String(ing?.unit || '').trim(),
        })),
      });
    }

    const translated = await translateIngredientsCs(toTranslate);
    for (const t of toTranslate) {
      const ingredients = translated.get(String(t.id));
      if (!ingredients) continue;
      result.set(String(t.id), { ingredients, image_url: t.image, via: 'spoonacular' });
      stats.branch_a_via_spoonacular++;
    }
  }
  return result;
}

function printSample(row, ingredients, branchLabel) {
  console.log('');
  console.log(`— [${branchLabel}] #${row.id} ${row.name_cs} (${row.kcal ?? '—'} kcal, source=${row.source}/${row.source_id})`);
  console.log(JSON.stringify(ingredients, null, 2));
}

async function main() {
  const { data: allRows, error } = await supabase
    .from('recipes_catalog')
    .select('id, source, source_id, name_cs, name_en, meal_type, kcal, protein_g, carbs_g, fat_g, ingredients, image_url')
    .eq('active', true)
    .order('id', { ascending: true });
  if (error) {
    console.error('Načtení recipes_catalog selhalo:', error.message);
    process.exit(1);
  }

  // Idempotence: jen řádky bez surovin.
  let missing = (allRows || []).filter((r) => !hasIngredients(r));
  if (LIMIT) missing = missing.slice(0, LIMIT);
  const branchA = missing.filter(isBranchA);
  const branchB = missing.filter((r) => !isBranchA(r));

  const estimate = {
    missing_total: missing.length,
    branch_a: branchA.length,
    branch_b: branchB.length,
    est_spoonacular_calls: Math.ceil(branchA.length / BULK_CHUNK),
    est_openai_calls:
      Math.ceil(branchA.length / OPENAI_CHUNK) + Math.ceil(branchB.length / OPENAI_CHUNK),
  };
  console.log(JSON.stringify({ mode: APPLY ? 'APPLY' : 'DRY-RUN', spoonacular_mode: SPOONACULAR_MODE, ...estimate }, null, 2));

  const spoonacularAvailable = SPOONACULAR_MODE === 'seed' && !!SPOONACULAR_KEY;
  if (!spoonacularAvailable && branchA.length) {
    console.warn('⚠️ Spoonacular nedostupný (vyžaduje SPOONACULAR_MODE=seed + SPOONACULAR_API_KEY) — větev A pojede přes OpenAI fallback.');
  }

  const procA = APPLY ? branchA : branchA.slice(0, DRY_RUN_SAMPLE_PER_BRANCH);
  const procB = APPLY ? branchB : branchB.slice(0, DRY_RUN_SAMPLE_PER_BRANCH);

  // ----- Větev A -----
  let aResults = new Map();
  if (procA.length && spoonacularAvailable) {
    aResults = await enrichBranchAViaSpoonacular(procA);
  }
  // Fallback pro A (mrtvý klíč / kvóta / chybějící extendedIngredients):
  const aFallback = procA.filter((r) => !aResults.has(String(r.id)));
  if (aFallback.length) {
    if (spoonacularAvailable) {
      console.warn(`⚠️ Větev A: ${aFallback.length} receptů bez dat ze Spoonacular → OpenAI fallback.`);
    }
    const gen = await generateIngredientsCs(
      aFallback.map((r) => ({ id: r.id, name_cs: r.name_cs, kcal: r.kcal, protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g }))
    );
    for (const [id, ingredients] of gen) {
      aResults.set(id, { ingredients, image_url: null, via: 'openai_fallback' });
      stats.branch_a_via_openai_fallback++;
    }
  }

  // ----- Větev B -----
  const bGen = procB.length
    ? await generateIngredientsCs(
        procB.map((r) => ({ id: r.id, name_cs: r.name_cs, kcal: r.kcal, protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g }))
      )
    : new Map();
  stats.branch_b_via_openai = bGen.size;

  // ----- Výstup / zápis -----
  if (!APPLY) {
    console.log('');
    console.log(`=== DRY-RUN VZOREK (${procA.length}×A + ${procB.length}×B) — tvar, který by se zapsal do recipes_catalog.ingredients ===`);
    for (const row of procA) {
      const res = aResults.get(String(row.id));
      if (res) printSample(row, res.ingredients, res.via === 'spoonacular' ? 'A: Spoonacular→CS' : 'A: OpenAI fallback');
      else console.log(`— [A] #${row.id} ${row.name_cs}: BEZ VÝSLEDKU`);
    }
    for (const row of procB) {
      const ing = bGen.get(String(row.id));
      if (ing) printSample(row, ing, 'B: OpenAI generované');
      else console.log(`— [B] #${row.id} ${row.name_cs}: BEZ VÝSLEDKU`);
    }
    console.log('');
    console.log(JSON.stringify({ dry_run: true, stats, estimate_full_run: estimate }, null, 2));
    console.log('Nic nebylo zapsáno. Plný zápis: SPOONACULAR_MODE=seed node scripts/enrichRecipeIngredients.mjs --apply');
    return;
  }

  for (const row of [...procA, ...procB]) {
    const fromA = aResults.get(String(row.id));
    const ingredients = fromA?.ingredients ?? bGen.get(String(row.id));
    if (!ingredients?.length) {
      stats.skipped_no_result++;
      continue;
    }
    const update = { ingredients };
    if (!row.image_url && fromA?.image_url) update.image_url = fromA.image_url;
    const { error: upErr } = await supabase.from('recipes_catalog').update(update).eq('id', row.id);
    if (upErr) {
      stats.failed++;
      console.error('[update-fail]', row.id, upErr.message);
    } else {
      stats.updated++;
    }
  }

  console.log(JSON.stringify({ ok: stats.failed === 0, ...stats }, null, 2));
  if (stats.skipped_no_result > 0) {
    console.log('Některé recepty zůstaly bez surovin — spusť skript znovu (idempotentní, doplní jen chybějící).');
  }
  process.exit(stats.failed > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
