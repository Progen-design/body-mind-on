/**
 * Offline integration test — import gate fixtures, no network / Supabase.
 *
 *   node --test lib/spoonacular/__tests__/importGate.integration.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  applyImportGateBatch,
  countMainIngredients,
  isSeasoningIngredient,
} from '../catalogImportGate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesPath = join(__dirname, 'fixtures', 'spoonacular-sample.json');
/** @type {Array<Record<string, unknown> & { _case: string, expected: string, catalogMealType: string }>} */
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8'));

const PROTECTED_SOURCE_IDS = new Set(['900007']);

/**
 * @param {import('../catalogImportGate.js').ImportGateSkippedItem[]} skipped
 * @param {string} sourceId
 * @returns {string}
 */
function skipReasonForId(skipped, sourceId) {
  const hit = skipped.find((s) => String(s.recipe.id) === sourceId);
  return hit ? hit.reason : 'kept';
}

test('each fixture gets expected gate verdict', () => {
  for (const fx of fixtures) {
    const batch = applyImportGateBatch([fx], fx.catalogMealType, PROTECTED_SOURCE_IDS);
    const id = String(fx.id);
    let verdict;
    if (batch.kept.some((r) => String(r.id) === id)) {
      verdict = 'kept';
    } else {
      verdict = skipReasonForId(batch.skipped, id);
    }
    assert.equal(
      verdict,
      fx.expected,
      `${fx._case}: expected ${fx.expected}, got ${verdict}`,
    );
  }
});

test('aggregated summary counters match fixture expectations', () => {
  /** @type {import('../catalogImportGate.js').ImportGateBatchSummary} */
  const totals = {
    fetched: 0,
    imported: 0,
    skipped_complex: 0,
    skipped_not_recipe: 0,
    skipped_missing_nutrition: 0,
    skipped_protected: 0,
  };

  /** @type {Record<string, number>} */
  const expected = {
    kept: 0,
    too_complex: 0,
    not_a_recipe: 0,
    missing_nutrition: 0,
    protected: 0,
  };

  for (const fx of fixtures) {
    expected[fx.expected] = (expected[fx.expected] || 0) + 1;
    const batch = applyImportGateBatch([fx], fx.catalogMealType, PROTECTED_SOURCE_IDS);
    totals.fetched += batch.summary.fetched;
    totals.imported += batch.summary.imported;
    totals.skipped_complex += batch.summary.skipped_complex;
    totals.skipped_not_recipe += batch.summary.skipped_not_recipe;
    totals.skipped_missing_nutrition += batch.summary.skipped_missing_nutrition;
    totals.skipped_protected += batch.summary.skipped_protected;
  }

  assert.equal(totals.fetched, fixtures.length);
  assert.equal(totals.imported, expected.kept);
  assert.equal(totals.skipped_complex, expected.too_complex);
  assert.equal(totals.skipped_not_recipe, expected.not_a_recipe);
  assert.equal(
    totals.skipped_missing_nutrition,
    expected.missing_nutrition,
  );
  assert.equal(totals.skipped_protected, expected.protected);
  assert.equal(
    totals.imported
      + totals.skipped_complex
      + totals.skipped_not_recipe
      + totals.skipped_missing_nutrition
      + totals.skipped_protected,
    totals.fetched,
  );
});

test('countMainIngredients edge cases — seasonings excluded', () => {
  const ings = [
    { nameClean: 'chicken' },
    { nameClean: 'salt' },
    { nameClean: 'pepper' },
    { nameClean: 'olive oil' },
    { nameClean: 'water' },
    { nameClean: 'sugar' },
    { nameClean: 'oregano' },
  ];
  assert.equal(countMainIngredients(ings), 1);
  assert.equal(isSeasoningIngredient('Sea Salt'), true);
  assert.equal(isSeasoningIngredient('OLIVE OIL'), true);
  assert.equal(isSeasoningIngredient('mletý pepř'), true);
});

test('countMainIngredients edge cases — empty or invalid input', () => {
  assert.equal(countMainIngredients([]), 0);
  assert.equal(countMainIngredients(null), 0);
  assert.equal(countMainIngredients(undefined), 0);
  assert.equal(countMainIngredients({ extendedIngredients: null }), 0);
  assert.equal(countMainIngredients({ extendedIngredients: 'nope' }), 0);
});
