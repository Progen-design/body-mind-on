/**
 * Load pantry/seasoning names from DB for import gate (shared with count_main_ingredients).
 */
import { supabaseServer } from '../supabaseServer.js';
import { normalizeIngredientName } from './catalogImportGate.js';

/** @type {Set<string>|null} */
let cachedPantry = null;

/** @type {Map<string, string>|null} */
let cachedAliases = null;

/**
 * @returns {Promise<Set<string>>}
 */
export async function loadPantryNormalizedSet() {
  if (cachedPantry) return cachedPantry;

  const { data, error } = await supabaseServer
    .from('pantry_ingredients')
    .select('name_normalized');

  if (error) throw new Error(`pantry_ingredients load failed: ${error.message}`);

  cachedPantry = new Set(
    (data || []).map((row) => String(row.name_normalized || '').trim()).filter(Boolean),
  );
  return cachedPantry;
}

/**
 * @returns {Promise<Map<string, string>>}
 */
export async function loadIngredientAliasMap() {
  if (cachedAliases) return cachedAliases;

  const { data, error } = await supabaseServer
    .from('ingredient_aliases')
    .select('alias_normalized, canonical_normalized');

  if (error) throw new Error(`ingredient_aliases load failed: ${error.message}`);

  cachedAliases = new Map(
    (data || []).map((row) => [
      String(row.alias_normalized || '').trim(),
      String(row.canonical_normalized || '').trim(),
    ]).filter(([a]) => a),
  );
  return cachedAliases;
}

/** Reset caches (tests). */
export function resetPantryCache() {
  cachedPantry = null;
  cachedAliases = null;
}

/**
 * @param {string} ingredientName
 * @param {Set<string>|undefined} pantrySet
 * @returns {boolean}
 */
export function isPantryIngredient(ingredientName, pantrySet) {
  const n = normalizeIngredientName(ingredientName);
  if (!n) return false;

  const set = pantrySet || cachedPantry;
  if (!set || set.size === 0) return false;

  if (set.has(n)) return true;

  for (const pantryName of set) {
    if (!pantryName.includes(' ')) continue;
    const escaped = pantryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
    if (re.test(n)) return true;
  }

  return false;
}

/**
 * Log unmapped ingredient for later alias expansion.
 *
 * @param {string} rawName
 */
export async function logIngredientNormalizationMiss(rawName) {
  const name = String(rawName || '').trim();
  if (!name) return;

  await supabaseServer
    .from('ingredient_normalization_misses')
    .upsert(
      { raw_name: name, plan_id: null, seen_at: new Date().toISOString() },
      { onConflict: 'raw_name,plan_id', ignoreDuplicates: false },
    );
}
