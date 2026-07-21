import { aggregateShoppingIngredientLinesForDayIndex } from './spoonacularShopping.js';
import { aggregateShoppingIngredientLines } from './shoppingListAggregate.js';

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function mealDisplayText(meal, overrideTitle = '') {
  const text = overrideTitle || meal?.text || meal?.fullHtml || '';
  return stripHtml(text).replace(/^(Snídaně|Oběd|Večeře|Svačina)\s*:?\s*/i, '').trim();
}

export function normalizeShoppingIngredient(item) {
  const s = String(item || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s;
}

export function dedupeShoppingItems(items) {
  const seen = new Set();
  const out = [];
  for (const raw of items || []) {
    const item = normalizeShoppingIngredient(raw);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function extractIngredientsFromRecipeHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const out = [];
  const seen = new Set();
  const surovinyRe = /suroviny\s*:?\s*<\/b>\s*([\s\S]*?)(?=<p\s*><b>|$)/gi;
  let match;
  while ((match = surovinyRe.exec(html)) !== null) {
    const block = stripHtml(match[1]);
    if (!block) continue;
    block.split(/[,;]|\s+-\s+/).forEach((part) => {
      const item = normalizeShoppingIngredient(part);
      if (!item) return;
      const key = item.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
  }
  return out;
}

export function extractIngredientsFromMealText(mealText) {
  if (!mealText || typeof mealText !== 'string') return [];
  const t = stripHtml(mealText);
  const out = [];
  const parenMatches = t.match(/\(([^)]+)\)/g) || [];
  for (const seg of parenMatches) {
    const inner = seg.replace(/^\(|\)$/g, '').trim();
    inner.split(/[,;]|\s+\+\s+|\s+a\s+/).forEach((part) => {
      const item = normalizeShoppingIngredient(part);
      if (item) out.push(item);
    });
  }
  return dedupeShoppingItems(out);
}

export function hasConcreteIngredientData(items) {
  const list = dedupeShoppingItems(items);
  if (!list.length) return false;
  return list.some((line) =>
    /\b(ks|g|kg|ml|l|lžice|lžička|porce|hrst|plátek|balení|špetka|dle chuti|cca|orientačně)\b/i.test(String(line))
  );
}

function fallbackItemsFromMeals(meals = [], mealOverrides = {}, dayIndex = 0) {
  const out = [];
  meals.forEach((meal, mi) => {
    const override = mealOverrides?.[`${dayIndex}_${mi}`];
    const text = mealDisplayText(meal, override?.title || '');
    if (text) out.push(text);
  });
  return dedupeShoppingItems(out);
}

function recipeHtmlItemsForDay(recipes = [], meals = [], mealOverrides = {}, dayIndex = 0) {
  const out = [];
  const recipesArr = Array.isArray(recipes) ? recipes : [];
  meals.forEach((meal, mi) => {
    const override = mealOverrides?.[`${dayIndex}_${mi}`];
    const text = mealDisplayText(meal, override?.title || '');
    if (!text) return;
    const match = recipesArr.find((r) => {
      const recipeName = stripHtml(r?.name || '').toLowerCase();
      const candidate = text.toLowerCase();
      return recipeName && (candidate.includes(recipeName) || recipeName.includes(candidate.slice(0, 25)));
    });
    if (match?.content) {
      out.push(...extractIngredientsFromRecipeHtml(match.content));
    }
  });
  return dedupeShoppingItems(out);
}

export function buildShoppingSectionForDay({
  dayName,
  dateStr,
  meals = [],
  recipes = [],
  structuredPlan = null,
  dayIndex = 0,
  mealOverrides = {},
}) {
  const heading = `${dayName || 'Den'}${dateStr ? ` (${dateStr})` : ''}`;
  const fromStructured = structuredPlan
    ? dedupeShoppingItems(aggregateShoppingIngredientLinesForDayIndex(structuredPlan, dayIndex))
    : [];
  if (fromStructured.length > 0) {
    return { heading, dayName: dayName || 'Den', dateStr: dateStr || '', items: fromStructured, note: '', isEstimated: false };
  }

  const fromRecipeHtml = recipeHtmlItemsForDay(recipes, meals, mealOverrides, dayIndex);
  if (fromRecipeHtml.length > 0) {
    return { heading, dayName: dayName || 'Den', dateStr: dateStr || '', items: fromRecipeHtml, note: '', isEstimated: false };
  }

  const fromMealText = dedupeShoppingItems(
    meals.flatMap((meal, mi) => {
      const override = mealOverrides?.[`${dayIndex}_${mi}`];
      const text = mealDisplayText(meal, override?.title || '');
      return extractIngredientsFromMealText(text);
    })
  );
  if (fromMealText.length > 0) {
    return {
      heading,
      dayName: dayName || 'Den',
      dateStr: dateStr || '',
      items: fromMealText,
      note: 'Když chybí přesné množství, ber položku jako orientační podle receptu.',
      isEstimated: true,
    };
  }

  const fallback = fallbackItemsFromMeals(meals, mealOverrides, dayIndex);
  return {
    heading,
    dayName: dayName || 'Den',
    dateStr: dateStr || '',
    items: fallback,
    note: fallback.length
      ? 'Přesné suroviny se nepodařilo rozpoznat. Seznam je orientační podle názvů jídel.'
      : '',
    isEstimated: fallback.length > 0,
  };
}

export function buildShoppingSectionsForWeek({ planWeekDays = [], recipes = [], structuredPlan = null, mealOverrides = {} }) {
  return (planWeekDays || []).map((day, idx) =>
    buildShoppingSectionForDay({
      dayName: day?.dayName || 'Den',
      dateStr: day?.dateStr || '',
      meals: Array.isArray(day?.meals) ? day.meals : [],
      recipes,
      structuredPlan,
      dayIndex: day?.originalIndex ?? idx,
      mealOverrides,
    })
  );
}

export function flattenShoppingSections(sections = []) {
  const allLines = (sections || []).flatMap((sec) => sec?.items || []);
  return aggregateShoppingIngredientLines(allLines);
}

export function buildShoppingItemsForMeal({
  meal = null,
  mealText = '',
  recipeHtml = '',
  structuredMeal = null,
} = {}) {
  const structuredCandidates = dedupeShoppingItems([
    ...(Array.isArray(structuredMeal?.shopping_ingredient_lines) ? structuredMeal.shopping_ingredient_lines : []),
    ...(Array.isArray(meal?.shopping_ingredient_lines) ? meal.shopping_ingredient_lines : []),
  ]);
  if (structuredCandidates.length > 0) {
    return {
      items: structuredCandidates,
      note: '',
      isEstimated: false,
      source: 'recipe',
    };
  }

  const fromRecipeHtml = dedupeShoppingItems(extractIngredientsFromRecipeHtml(recipeHtml));
  if (fromRecipeHtml.length > 0) {
    return {
      items: fromRecipeHtml,
      note: '',
      isEstimated: false,
      source: 'recipe',
    };
  }

  const normalizedText = String(mealText || '').trim() || mealDisplayText(meal || {}, '');
  const fromMealText = dedupeShoppingItems(extractIngredientsFromMealText(normalizedText));
  if (fromMealText.length > 0) {
    return {
      items: fromMealText,
      note: 'Když chybí přesné množství, ber položku jako orientační podle receptu.',
      isEstimated: true,
      source: 'meal_text',
    };
  }

  const fallbackText = mealDisplayText(meal || {}, normalizedText);
  const fallbackItems = fallbackText ? dedupeShoppingItems([fallbackText]) : [];
  return {
    items: fallbackItems,
    note: fallbackItems.length
      ? 'Přesné suroviny se nepodařilo rozpoznat. Seznam je orientační podle názvu jídla.'
      : '',
    isEstimated: fallbackItems.length > 0,
    source: 'estimated',
  };
}
