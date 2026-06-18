/**
 * Detail receptu z recipes_catalog — bez Spoonacular HTTP.
 */
import { supabaseServer } from './supabaseServer';
import { ingredientLinesFromCatalogRow } from './recipesCatalog';
import {
  buildNutritionHtml,
  recipePartsToHtml,
  wantsHtmlDocument,
  wrapRecipeHtmlDocument,
  respondRecipeError,
} from './recipeDetailHtml';

const CATALOG_SELECT =
  'id, source, source_id, name_cs, name_en, meal_type, kcal, protein_g, carbs_g, fat_g, ingredients, instructions, instructions_cs, image_url, spoonacular_url, active';

/**
 * Najde řádek podle ID z plánu (recipes_catalog.id, pak source_id).
 * @param {number|string} recipeRef
 */
export async function findCatalogRowByRecipeRef(recipeRef) {
  const ref = String(recipeRef ?? '').trim();
  if (!ref || !/^\d+$/.test(ref)) return null;

  const num = Number(ref);
  if (Number.isFinite(num)) {
    const { data: byId, error: e1 } = await supabaseServer
      .from('recipes_catalog')
      .select(CATALOG_SELECT)
      .eq('active', true)
      .eq('id', num)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (byId) return byId;
  }

  const { data: bySource, error: e2 } = await supabaseServer
    .from('recipes_catalog')
    .select(CATALOG_SELECT)
    .eq('active', true)
    .eq('source_id', ref)
    .maybeSingle();
  if (e2) throw new Error(e2.message);
  return bySource || null;
}

function instructionLinesFromCatalogRow(row) {
  const ins = row?.instructions_cs ?? row?.instructions;
  if (!ins) return [];
  if (Array.isArray(ins)) {
    return ins
      .map((step) => {
        if (typeof step === 'string') return step.trim();
        if (step && typeof step === 'object') {
          return String(step.step || step.text || step.original || '').trim();
        }
        return '';
      })
      .filter(Boolean);
  }
  if (typeof ins === 'string' && ins.trim()) return [ins.trim()];
  return [];
}

function macroNutrientsFromCatalogRow(row) {
  const nutrients = [];
  const kcal = row.kcal != null ? Number(row.kcal) : null;
  if (Number.isFinite(kcal)) {
    nutrients.push({
      name: 'Calories',
      amount: Math.round(kcal),
      unit: 'kcal',
      percentOfDailyNeeds: Math.min(100, Math.round(kcal / 20)),
    });
  }
  if (row.protein_g != null && Number.isFinite(Number(row.protein_g))) {
    nutrients.push({
      name: 'Protein',
      amount: Number(row.protein_g),
      unit: 'g',
      percentOfDailyNeeds: Math.min(100, Math.round(Number(row.protein_g) * 2)),
    });
  }
  if (row.carbs_g != null && Number.isFinite(Number(row.carbs_g))) {
    nutrients.push({
      name: 'Carbohydrates',
      amount: Number(row.carbs_g),
      unit: 'g',
      percentOfDailyNeeds: Math.min(100, Math.round(Number(row.carbs_g) * 0.5)),
    });
  }
  if (row.fat_g != null && Number.isFinite(Number(row.fat_g))) {
    nutrients.push({
      name: 'Fat',
      amount: Number(row.fat_g),
      unit: 'g',
      percentOfDailyNeeds: Math.min(100, Math.round(Number(row.fat_g) * 1.2)),
    });
  }
  return nutrients;
}

export function catalogRowToRecipeHtml(row) {
  if (!row) return '';
  const title = String(row.name_cs || row.name_en || 'Recept').trim();
  const ingredients_cs = ingredientLinesFromCatalogRow(row);
  const instructions_cs = instructionLinesFromCatalogRow(row);
  const nutritionHtml = buildNutritionHtml(macroNutrientsFromCatalogRow(row));
  return recipePartsToHtml({
    title,
    ingredients_cs,
    instructions_cs,
    image_url: row.image_url,
    nutritionHtml,
  });
}

/**
 * GET handler — JSON { ok, html } pro modal, HTML dokument pro e-mail.
 */
export async function handleRecipeFromCatalogRequest(req, res) {
  const id = (req.query.id || '').trim();
  if (!id || !/^\d+$/.test(id)) {
    return respondRecipeError(
      req,
      res,
      400,
      'Parametr id musí být číslo (recipes_catalog.id nebo source_id u starých plánů)'
    );
  }

  let row;
  try {
    row = await findCatalogRowByRecipeRef(id);
  } catch (err) {
    console.error('[recipe-from-catalog] lookup failed:', err.message || err);
    return respondRecipeError(req, res, 500, 'Recept se nepodařilo načíst');
  }

  if (!row) {
    return respondRecipeError(
      req,
      res,
      404,
      'Recept v katalogu nebyl nalezen. U staršího plánu může být potřeba vygenerovat nový týden.'
    );
  }

  const html = catalogRowToRecipeHtml(row);
  if (!html) {
    return respondRecipeError(req, res, 502, 'Recept nemá dostupná data v katalogu');
  }

  const displayTitle = String(row.name_cs || row.name_en || 'Recept').trim() || 'Recept';

  if (wantsHtmlDocument(req)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(wrapRecipeHtmlDocument(displayTitle, html));
  }

  return res.status(200).json({ ok: true, html });
}
