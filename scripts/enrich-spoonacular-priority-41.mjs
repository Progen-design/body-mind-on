#!/usr/bin/env node
/**
 * One-shot Spoonacular enrichment for up to 41 priority recipes.
 * - Backup originals once
 * - Replace ingredients with metric grams PER SERVING
 * - Update kcal/macros from nutrition.nutrients (per serving)
 * - Upsert ingredients_nutrition (per 100 g)
 * meal_cache skipped (non-numeric source_id).
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const LIMIT = 41;
const PAUSE_MS = 400;

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

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SPOON_KEY = process.env.SPOONACULAR_API_KEY || '';
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!SPOON_KEY) {
  console.error('Missing SPOONACULAR_API_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const SPICE_RE = /(sůl|\bsul\b|pepř|pepr|skořic|skoric|bazalka|oregano|tymián|tymian|rozmarýn|rozmaryn|petržel|pažitka|chili|vanilka|muškát|hřebíček|kmín|koriandr|máta|cayenne|kurkuma|zdobení|špetka|olej na)/i;
const BAD_UNIT_RE = /(^porce$|^porcí$|hrnek|hrst|plechovka|balení|baleni|^pint$|litru|^litr$)/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBadUnit(unit) {
  const u = String(unit || '').toLowerCase().trim();
  return BAD_UNIT_RE.test(u) || u.includes('plechovka') || u.startsWith('hrst');
}

function isSpiceName(name) {
  return SPICE_RE.test(String(name || ''));
}

function pickNutrient(nutrients, name) {
  const list = Array.isArray(nutrients) ? nutrients : [];
  const hit = list.find((n) => String(n?.name || '').toLowerCase() === name.toLowerCase());
  return hit && Number.isFinite(Number(hit.amount)) ? Number(hit.amount) : null;
}

const NON_MASS_UNIT_RE = /(servings?|porce|porcí|porci|hrnek|hrst|plechovka|balení|baleni|pint|cup|tbsp|tsp|tablespoon|teaspoon|clove|piece|slice|leaf|leaves|pinch|dash)/i;

function isMassMetricUnit(unit) {
  const u = String(unit || '').toLowerCase().trim();
  if (!u || NON_MASS_UNIT_RE.test(u)) return false;
  return u === 'g' || u === 'gram' || u === 'grams' || u === 'gr'
    || u === 'kg' || u === 'ml' || u === 'milliliter' || u === 'milliliters'
    || u === 'l' || u === 'liter' || u === 'liters';
}

/**
 * Whole-recipe metric mass in grams. Returns null for servings/porce/etc.
 * Never invent grams from non-mass units.
 */
function metricGramsWhole(ing) {
  const topUnit = String(ing?.unit || '').trim();
  if (topUnit && NON_MASS_UNIT_RE.test(topUnit)) return null;

  const m = ing?.measures?.metric;
  if (!m || !Number.isFinite(Number(m.amount))) return null;
  const unit = String(m.unitShort || m.unitLong || '').trim();
  if (!isMassMetricUnit(unit)) return null;

  const amount = Number(m.amount);
  if (!(amount > 0)) return null;
  const u = unit.toLowerCase();
  if (u === 'g' || u === 'gram' || u === 'grams' || u === 'gr') return amount;
  if (u === 'kg') return amount * 1000;
  if (u === 'ml' || u === 'milliliter' || u === 'milliliters') return amount; // ≈ g for density~1
  if (u === 'l' || u === 'liter' || u === 'liters') return amount * 1000;
  return null;
}

/**
 * Physical sanity gate for per-100 g nutrition. Prefer missing over nonsense.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function validatePer100g(row) {
  const kcal = Number(row.kcal_per_100g);
  const p = Number(row.protein_g_per_100g);
  const c = Number(row.carbs_g_per_100g);
  const f = Number(row.fat_g_per_100g);
  if (!Number.isFinite(kcal) || kcal < 0 || kcal > 900) {
    return { ok: false, reason: `kcal_per_100g=${kcal}` };
  }
  for (const [label, v] of [['protein', p], ['carbs', c], ['fat', f]]) {
    if (v == null || Number.isNaN(v)) continue;
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      return { ok: false, reason: `${label}_g_per_100g=${v}` };
    }
  }
  const pSafe = Number.isFinite(p) ? p : 0;
  const cSafe = Number.isFinite(c) ? c : 0;
  const fSafe = Number.isFinite(f) ? f : 0;
  if (pSafe + cSafe + fSafe > 100) {
    return { ok: false, reason: `macros_sum=${Math.round((pSafe + cSafe + fSafe) * 10) / 10}` };
  }
  if (kcal > 0) {
    const fromMacros = pSafe * 4 + cSafe * 4 + fSafe * 9;
    const delta = Math.abs(kcal - fromMacros) / kcal;
    if (delta > 0.15) {
      return { ok: false, reason: `macro_gate_delta=${Math.round(delta * 1000) / 10}%` };
    }
  }
  return { ok: true };
}

function formatAmount(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 100) return Math.round(n);
  if (n >= 10) return Math.round(n * 10) / 10;
  return Math.round(n * 100) / 100;
}

function scoreTarget(row) {
  const ings = Array.isArray(row.ingredients) ? row.ingredients : [];
  let badSig = 0;
  for (const i of ings) {
    if (isBadUnit(i?.unit) && !isSpiceName(i?.name)) badSig += 1;
  }
  const kcal = Number(row.kcal) || 0;
  const fromMacros = Math.round((Number(row.protein_g) || 0) * 4 + (Number(row.carbs_g) || 0) * 4 + (Number(row.fat_g) || 0) * 9);
  const deltaPct = kcal > 0 ? Math.abs(kcal - fromMacros) / kcal : 0;
  const needMacros = deltaPct > 0.10 ? 1 : 0;
  const needGrams = badSig > 0 ? 1 : 0;
  return { badSig, needMacros, needGrams, deltaPct };
}

async function fetchTargets() {
  const { data, error } = await supabase
    .from('recipes_catalog')
    .select('id, name_cs, source, source_id, kcal, protein_g, carbs_g, fat_g, servings, ingredients, kcal_original, ingredients_original, servings_original')
    .eq('source', 'spoonacular')
    .eq('active', true)
    .not('source_id', 'is', null);
  if (error) throw error;

  const scored = [];
  for (const row of data || []) {
    if (!/^\d+$/.test(String(row.source_id || ''))) continue;
    const s = scoreTarget(row);
    if (!s.needGrams && !s.needMacros) continue;
    scored.push({ ...row, ...s });
  }

  scored.sort((a, b) => (
    b.needGrams - a.needGrams
    || b.badSig - a.badSig
    || b.needMacros - a.needMacros
    || b.deltaPct - a.deltaPct
    || a.id - b.id
  ));

  return scored.slice(0, LIMIT);
}

async function fetchRecipe(sourceId) {
  const u = `https://api.spoonacular.com/recipes/${encodeURIComponent(sourceId)}/information?includeNutrition=true&apiKey=${encodeURIComponent(SPOON_KEY)}`;
  const res = await fetch(u, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  const quota = {
    request: res.headers.get('x-api-quota-request'),
    used: res.headers.get('x-api-quota-used'),
    left: res.headers.get('x-api-quota-left'),
  };
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { status: res.status, quota, body };
}

function buildPerServingIngredients(extendedIngredients, servings, oldIngredients) {
  const serv = Math.max(1, Number(servings) || 1);
  const old = Array.isArray(oldIngredients) ? oldIngredients : [];
  return (extendedIngredients || []).map((ing, idx) => {
    const gramsWhole = metricGramsWhole(ing);
    const perServing = gramsWhole != null ? gramsWhole / serv : null;
    const amount = perServing != null ? formatAmount(perServing) : (
      Number.isFinite(Number(ing.amount)) ? formatAmount(Number(ing.amount) / serv) : null
    );
    const unit = perServing != null ? 'g' : String(ing.unit || ing.measures?.metric?.unitShort || '').trim();
    const czechName = old[idx]?.name && String(old[idx].name).trim() ? String(old[idx].name).trim() : null;
    const name = czechName || String(ing.name || ing.nameClean || 'surovina').trim();
    const original = amount != null
      ? `${amount} ${unit} ${name}`.trim()
      : String(ing.original || name).trim();
    return {
      name,
      name_en: String(ing.name || '').trim() || null,
      amount,
      unit,
      original,
      spoonacular_ingredient_id: Number.isFinite(Number(ing.id)) ? Number(ing.id) : null,
      metric_grams_whole: gramsWhole,
    };
  });
}

function buildNutritionPer100g(body, servings, skipLog = []) {
  const serv = Math.max(1, Number(servings) || 1);
  const extended = Array.isArray(body.extendedIngredients) ? body.extendedIngredients : [];
  const byId = new Map(extended.map((e) => [Number(e.id), e]));
  const byName = new Map(extended.map((e) => [normalizeName(e.name), e]));
  const out = [];

  for (const ni of body?.nutrition?.ingredients || []) {
    const nameEn = String(ni.name || '').trim();
    const ext = byId.get(Number(ni.id)) || byName.get(normalizeName(ni.name));
    if (!ext) {
      skipLog.push({ name_en: nameEn, reason: 'no_extended_ingredient_match' });
      continue;
    }

    // No metric grams (servings/porce/…) → never invent per-100 g values.
    const gramsWhole = metricGramsWhole(ext);
    if (gramsWhole == null || gramsWhole <= 0) {
      skipLog.push({
        name_en: nameEn,
        reason: 'no_metric_grams',
        unit: String(ext.unit || ext.measures?.metric?.unitShort || ''),
      });
      continue;
    }
    const gramsPerServing = gramsWhole / serv;
    if (!(gramsPerServing > 0)) {
      skipLog.push({ name_en: nameEn, reason: 'grams_per_serving_invalid' });
      continue;
    }

    const kcal = pickNutrient(ni.nutrients, 'Calories');
    const protein = pickNutrient(ni.nutrients, 'Protein');
    const carbs = pickNutrient(ni.nutrients, 'Carbohydrates');
    const fat = pickNutrient(ni.nutrients, 'Fat');
    if (kcal == null) {
      skipLog.push({ name_en: nameEn, reason: 'missing_calories' });
      continue;
    }

    const row = {
      name_en: nameEn || String(ext?.name || '').trim(),
      name_normalized: normalizeName(ni.name || ext?.name),
      spoonacular_ingredient_id: Number.isFinite(Number(ni.id)) ? Number(ni.id) : null,
      kcal_per_100g: Math.round((kcal / gramsPerServing) * 100 * 10) / 10,
      protein_g_per_100g: protein != null ? Math.round((protein / gramsPerServing) * 100 * 10) / 10 : null,
      carbs_g_per_100g: carbs != null ? Math.round((carbs / gramsPerServing) * 100 * 10) / 10 : null,
      fat_g_per_100g: fat != null ? Math.round((fat / gramsPerServing) * 100 * 10) / 10 : null,
    };

    const gate = validatePer100g(row);
    if (!gate.ok) {
      skipLog.push({
        name_en: row.name_en,
        reason: `validation_gate:${gate.reason}`,
        kcal_per_100g: row.kcal_per_100g,
        protein_g_per_100g: row.protein_g_per_100g,
        carbs_g_per_100g: row.carbs_g_per_100g,
        fat_g_per_100g: row.fat_g_per_100g,
        grams_per_serving: Math.round(gramsPerServing * 100) / 100,
      });
      continue;
    }

    out.push(row);
  }
  return out;
}

async function upsertIngredientNutrition(rows, skipLog = []) {
  let upserted = 0;
  for (const row of rows) {
    if (!row.name_normalized) continue;

    // Defense in depth — never write impossible nutrition.
    const gate = validatePer100g(row);
    if (!gate.ok) {
      skipLog.push({ name_en: row.name_en, reason: `upsert_gate:${gate.reason}` });
      continue;
    }

    const { data: existing } = await supabase
      .from('ingredients_nutrition')
      .select('id, sample_count, kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g')
      .eq('name_normalized', row.name_normalized)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('ingredients_nutrition').insert({
        name_en: row.name_en,
        name_normalized: row.name_normalized,
        spoonacular_ingredient_id: row.spoonacular_ingredient_id,
        kcal_per_100g: row.kcal_per_100g,
        protein_g_per_100g: row.protein_g_per_100g,
        carbs_g_per_100g: row.carbs_g_per_100g,
        fat_g_per_100g: row.fat_g_per_100g,
        sample_count: 1,
        source: 'spoonacular_enrichment',
        updated_at: new Date().toISOString(),
      });
      if (!error) upserted += 1;
      continue;
    }

    const n = Number(existing.sample_count) || 1;
    const avg = (oldV, newV) => {
      if (newV == null) return oldV;
      if (oldV == null) return newV;
      return Math.round((((Number(oldV) * n) + Number(newV)) / (n + 1)) * 10) / 10;
    };
    const averaged = {
      ...row,
      kcal_per_100g: avg(existing.kcal_per_100g, row.kcal_per_100g),
      protein_g_per_100g: avg(existing.protein_g_per_100g, row.protein_g_per_100g),
      carbs_g_per_100g: avg(existing.carbs_g_per_100g, row.carbs_g_per_100g),
      fat_g_per_100g: avg(existing.fat_g_per_100g, row.fat_g_per_100g),
    };
    const avgGate = validatePer100g(averaged);
    if (!avgGate.ok) {
      skipLog.push({
        name_en: row.name_en,
        reason: `avg_gate:${avgGate.reason}`,
      });
      continue;
    }

    const { error } = await supabase.from('ingredients_nutrition').update({
      name_en: row.name_en || undefined,
      spoonacular_ingredient_id: row.spoonacular_ingredient_id || undefined,
      kcal_per_100g: averaged.kcal_per_100g,
      protein_g_per_100g: averaged.protein_g_per_100g,
      carbs_g_per_100g: averaged.carbs_g_per_100g,
      fat_g_per_100g: averaged.fat_g_per_100g,
      sample_count: n + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id);
    if (!error) upserted += 1;
  }
  return upserted;
}

async function main() {
  const targets = await fetchTargets();
  console.log(JSON.stringify({
    selected: targets.length,
    limit: LIMIT,
    preview: targets.slice(0, 8).map((t) => ({
      id: t.id,
      name_cs: t.name_cs,
      source_id: t.source_id,
      need_grams: t.needGrams,
      bad_sig: t.badSig,
      need_macros: t.needMacros,
      delta_pct: Math.round(t.deltaPct * 1000) / 10,
    })),
  }, null, 2));

  const log = {
    started_at: new Date().toISOString(),
    selected: targets.length,
    ok: 0,
    failed: 0,
    skipped_404: 0,
    ingredient_nutrition_upserts: 0,
    ingredient_nutrition_skips: 0,
    quota_last: null,
    nutrition_skips: [],
    rows: [],
  };

  for (let i = 0; i < targets.length; i += 1) {
    const row = targets[i];
    const label = `[${i + 1}/${targets.length}] id=${row.id} source_id=${row.source_id} ${row.name_cs}`;
    process.stdout.write(`${label} ... `);

    const { status, quota, body } = await fetchRecipe(row.source_id);
    log.quota_last = quota;

    if (status === 404) {
      console.log('404 skip');
      log.skipped_404 += 1;
      log.rows.push({ id: row.id, source_id: row.source_id, status: '404' });
      await sleep(PAUSE_MS);
      continue;
    }
    if (status !== 200 || !body?.id) {
      console.log(`FAIL HTTP ${status}`);
      log.failed += 1;
      log.rows.push({ id: row.id, source_id: row.source_id, status: `http_${status}`, message: body?.message || null });
      await sleep(PAUSE_MS);
      continue;
    }

    const servingsApi = Math.max(1, Number(body.servings) || Number(row.servings) || 1);
    const nutrients = body?.nutrition?.nutrients || [];
    const kcal = pickNutrient(nutrients, 'Calories');
    const protein = pickNutrient(nutrients, 'Protein');
    const carbs = pickNutrient(nutrients, 'Carbohydrates');
    const fat = pickNutrient(nutrients, 'Fat');

    const newIngredients = buildPerServingIngredients(
      body.extendedIngredients || [],
      servingsApi,
      row.ingredients
    ).map(({ metric_grams_whole, ...rest }) => rest);

    const skipLog = [];
    const per100 = buildNutritionPer100g(body, servingsApi, skipLog);
    const upserted = await upsertIngredientNutrition(per100, skipLog);
    log.ingredient_nutrition_upserts += upserted;
    log.ingredient_nutrition_skips += skipLog.length;
    if (skipLog.length) {
      log.nutrition_skips.push({
        recipe_id: row.id,
        source_id: row.source_id,
        skips: skipLog,
      });
      const gateSkips = skipLog.filter((s) => /gate/i.test(String(s.reason || '')));
      if (gateSkips.length) {
        console.warn(`  skip nutrition gate: ${gateSkips.map((s) => `${s.name_en}(${s.reason})`).join('; ')}`);
      }
    }

    const patch = {
      ingredients: newIngredients,
      servings: 1,
      enriched_at: new Date().toISOString(),
      enrichment_source: 'spoonacular_information_includeNutrition',
    };
    if (kcal != null) patch.kcal = Math.round(kcal);
    if (protein != null) patch.protein_g = Math.round(protein * 100) / 100;
    if (carbs != null) patch.carbs_g = Math.round(carbs * 100) / 100;
    if (fat != null) patch.fat_g = Math.round(fat * 100) / 100;

    // Backup only once
    if (row.kcal_original == null) patch.kcal_original = row.kcal;
    if (row.ingredients_original == null) patch.ingredients_original = row.ingredients;
    if (row.servings_original == null) patch.servings_original = row.servings;
    // Always snapshot macros originals if empty
    const { data: fresh } = await supabase
      .from('recipes_catalog')
      .select('protein_g_original, carbs_g_original, fat_g_original')
      .eq('id', row.id)
      .maybeSingle();
    if (fresh?.protein_g_original == null) patch.protein_g_original = row.protein_g;
    if (fresh?.carbs_g_original == null) patch.carbs_g_original = row.carbs_g;
    if (fresh?.fat_g_original == null) patch.fat_g_original = row.fat_g;

    const { error: updErr } = await supabase
      .from('recipes_catalog')
      .update(patch)
      .eq('id', row.id);

    if (updErr) {
      console.log(`DB FAIL ${updErr.message}`);
      log.failed += 1;
      log.rows.push({ id: row.id, status: 'db_error', message: updErr.message });
    } else {
      console.log(`OK kcal=${patch.kcal} ings=${newIngredients.length} nutr100=${per100.length} quota_left=${quota.left}`);
      log.ok += 1;
      log.rows.push({
        id: row.id,
        source_id: row.source_id,
        status: 'ok',
        kcal: patch.kcal,
        ingredients: newIngredients.length,
        nutrition_100g_rows: per100.length,
        quota,
      });
    }

    await sleep(PAUSE_MS);
  }

  log.finished_at = new Date().toISOString();
  const outPath = resolve(process.cwd(), 'scripts/_tmp-spoonacular-enrichment-41-log.json');
  writeFileSync(outPath, JSON.stringify(log, null, 2), 'utf8');
  console.log(JSON.stringify({
    ok: log.ok,
    failed: log.failed,
    skipped_404: log.skipped_404,
    ingredient_nutrition_upserts: log.ingredient_nutrition_upserts,
    ingredient_nutrition_skips: log.ingredient_nutrition_skips,
    quota_last: log.quota_last,
    log_file: 'scripts/_tmp-spoonacular-enrichment-41-log.json',
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
