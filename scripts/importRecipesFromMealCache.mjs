#!/usr/bin/env node
/**
 * Import receptů z meal_metadata_cache → recipes_catalog (0 Spoonacular pointů).
 * meal_type přiřazuje OpenAI klasifikátor (scripts/mealTypeClassifier.mjs) —
 * stejná logika jako recategorizeMeals.mjs; regex heuristika jen jako fallback.
 * Spustit: node scripts/importRecipesFromMealCache.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import OpenAI from 'openai';
import { classifyMealTypesWithOpenAI } from './mealTypeClassifier.mjs';

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (existsSync(p)) {
    const c = readFileSync(p, 'utf8');
    for (const line of c.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    break;
  }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

/** Regex fallback, když OpenAI klasifikace není k dispozici. */
function inferMealType(name) {
  const n = String(name || '').toLowerCase();
  if (/smoothie|ovesn|jogurt|vejce|tvaroh|toast|müsli|muesli|palačink|omelet|kaše|snídan/i.test(n)) return 'snidane';
  if (/svačin|snack|ořech/i.test(n)) return 'svacina';
  if (/večeř|vecer/i.test(n)) return 'vecere';
  return 'obed';
}

async function main() {
  const { data: rows, error } = await supabase.from('meal_metadata_cache').select('*');
  if (error) {
    console.error('Načtení meal_metadata_cache selhalo:', error.message);
    process.exit(1);
  }

  let upserted = 0;
  const byType = { snidane: 0, obed: 0, vecere: 0, svacina: 0 };

  const importable = (rows || []).filter((row) => {
    const nameCs = String(row.name || row.meal_name || '').trim();
    const kcal = Math.round(Number(row.calories) || 0);
    return nameCs && kcal >= 80;
  });

  let classifiedTypes = new Map();
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      classifiedTypes = await classifyMealTypesWithOpenAI(
        openai,
        importable.map((row, idx) => ({
          id: idx,
          name_cs: String(row.name || row.meal_name || '').trim(),
          name_en: String(row.name || row.meal_name || '').trim(),
          kcal: Math.round(Number(row.calories) || 0),
          protein_g: row.protein_g != null ? Number(row.protein_g) : null,
          carbs_g: row.carbs_g != null ? Number(row.carbs_g) : null,
          fat_g: row.fat_g != null ? Number(row.fat_g) : null,
        }))
      );
    } catch (e) {
      console.warn('OpenAI klasifikace selhala — fallback na regex heuristiku:', e.message);
    }
  } else {
    console.warn('OPENAI_API_KEY chybí — meal_type podle regex heuristiky (méně přesné).');
  }

  for (let idx = 0; idx < importable.length; idx++) {
    const row = importable[idx];
    const nameCs = String(row.name || row.meal_name || '').trim();
    const kcal = Math.round(Number(row.calories) || 0);

    const mealType = classifiedTypes.get(String(idx)) || inferMealType(nameCs);
    const sourceId = String(row.name_key || row.id || nameCs).slice(0, 120);
    const spoonacularId = row.spoonacular_id ?? null;
    const spoonacularUrl =
      spoonacularId != null
        ? `https://spoonacular.com/recipe/${spoonacularId}`
        : null;

    const payload = {
      source: 'meal_cache',
      source_id: sourceId,
      name_cs: nameCs,
      name_en: nameCs,
      meal_type: mealType,
      kcal,
      protein_g: row.protein_g != null ? Number(row.protein_g) : null,
      carbs_g: row.carbs_g != null ? Number(row.carbs_g) : null,
      fat_g: row.fat_g != null ? Number(row.fat_g) : null,
      diet_tags: [],
      servings: row.servings ?? 1,
      ingredients: row.ingredients ?? null,
      instructions: null,
      spoonacular_url: spoonacularUrl,
      image_url: row.image_url || null,
      active: true,
    };

    const { error: upErr } = await supabase
      .from('recipes_catalog')
      .upsert(payload, { onConflict: 'source,source_id' });

    if (upErr) {
      console.warn('Upsert skip:', nameCs, upErr.message);
      continue;
    }
    upserted++;
    byType[mealType] = (byType[mealType] || 0) + 1;
  }

  console.log(JSON.stringify({ ok: true, imported: upserted, by_meal_type: byType, source_rows: rows?.length ?? 0 }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
