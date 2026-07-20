/**
 * Invariant: display_name of a catalog-backed meal === recipes_catalog.name_cs.
 * Slot / START template names must never become the user-facing title.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  catalogMealDisplayFields,
  applyCatalogRowDisplayNameToMeal,
  mealDisplayMatchesCatalogName,
  assertPlanMealsMatchCatalogNames,
} from '../../planDataIntegrity.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

console.log('--- catalog meal name alignment ---');

{
  const row = { name_cs: 'Cottage s pečivem', name_en: 'Cottage with bread' };
  const slot = { name_cs: 'Rýže s tuňákem', planner_source: 'simple_meal_planner_agent' };
  const labels = catalogMealDisplayFields(row, slot);
  assert(labels.display_name_cs === 'Cottage s pečivem', `display ${labels.display_name_cs}`);
  assert(labels.name_cs === 'Cottage s pečivem', `name ${labels.name_cs}`);
  assert(labels.planner_suggestion_cs === 'Rýže s tuňákem', 'slot as suggestion only');
  assert(mealDisplayMatchesCatalogName(labels, row.name_cs).ok, 'invariant helper');
  console.log('OK catalogMealDisplayFields ignores agent slot title');
}

{
  const meal = {
    name_cs: 'Kuře se zeleninou',
    display_name_cs: 'Kuře se zeleninou',
    display_name: 'Kuře se zeleninou',
    catalog_id: 7,
    recipe: { title_cs: 'wrong' },
  };
  applyCatalogRowDisplayNameToMeal(meal, { name_cs: 'Omeleta se zeleninou', name_en: 'Omelette' });
  assert(meal.display_name_cs === 'Omeleta se zeleninou', 'forced from catalog');
  assert(meal.planner_suggestion_cs === 'Kuře se zeleninou', 'old slot as suggestion');
  assert(meal.recipe.title_cs === 'Omeleta se zeleninou', 'recipe title_cs synced');
  console.log('OK applyCatalogRowDisplayNameToMeal');
}

{
  const plan = {
    days: [{
      day_index: 0,
      meals: [
        { catalog_id: 1, display_name_cs: 'A', name_cs: 'A' },
        { catalog_id: 2, display_name_cs: 'Wrong', name_cs: 'Wrong' },
      ],
    }],
  };
  const catalogById = {
    1: { name_cs: 'A' },
    2: { name_cs: 'Right' },
  };
  const result = assertPlanMealsMatchCatalogNames(plan, catalogById);
  assert(result.ok === false, 'detects mismatch');
  assert(result.mismatches.length === 1, `one mismatch got ${result.mismatches.length}`);
  console.log('OK assertPlanMealsMatchCatalogNames');
}

{
  const src = readFileSync(resolve(process.cwd(), 'lib/recipesCatalog.js'), 'utf8');
  assert(src.includes('catalogMealDisplayFields'), 'recipesCatalog uses catalogMealDisplayFields');
  assert(
    !/agentName\s*=\s*slotMeal\?\.name_cs/.test(src),
    'recipesCatalog must not assign display from agent slot name'
  );
  assert(
    !/display_name_cs\s*=\s*agentName/.test(src),
    'display_name_cs must not be agentName'
  );
  console.log('OK recipesCatalog source invariant');
}

console.log('All catalog meal name alignment checks passed.');
