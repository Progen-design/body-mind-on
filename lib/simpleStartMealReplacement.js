/**
 * START náhrada jídla z lokální knihovny (bez Spoonacular).
 */
import { START_MEAL_TEMPLATES } from './services/simpleMealPlannerAgent.js';
import { resolveSimpleStartTitle, SIMPLE_START_RECIPES } from './simpleStartRecipeLibrary.js';
import {
  parseDietaryExclusions,
  isTemplateAllowedForExclusions,
  mealContainsExcludedFood,
} from './dietaryExclusions.js';
import { buildSimpleStartLibraryMeal } from './simpleStartRecipeLibrary.js';

function dietKey(bodyMetrics) {
  const d = String(bodyMetrics?.diet_type || 'standard').toLowerCase();
  if (d === 'vegan') return 'vegan';
  if (d === 'vegetarian') return 'vegetarian';
  return 'standard';
}

function normalizeTitle(value) {
  return resolveSimpleStartTitle(String(value || '').trim()) || String(value || '').trim();
}

/**
 * @param {object} params
 * @param {string} params.mealType
 * @param {string} params.currentTitle
 * @param {object} params.bodyMetrics
 * @param {string[]} [params.excludeTitles]
 * @param {number} [params.targetKcal]
 * @param {boolean} [params.requireLibraryRecipe] Jen kandidáty, které umí
 *   postavit SIMPLE_START_RECIPES. Výchozí `false` — enforceDietaryPublishGate
 *   (lib/dietaryPublishGate.js) tenhle parametr neposílá a spoléhá na to, že
 *   i šablona bez knihovního receptu je platný kandidát (viz komentář
 *   u volání v lib/planMealReplace.js, kde se `true` posílá).
 * @param {number} [params.variationSeed] Kolikátá záměna TOHOTO slotu (0 =
 *   první). PROMPT_PRO_CODE.md bod C — na produkci se opakovaná záměna
 *   ustálila na dvou střídajících se jídlech, protože se vždy bral
 *   nejbližší kalorický kandidát (`within[0]`). Round-robin přes `within`
 *   podle tohohle počítadla je ZLEPŠENÍ, NE ZÁRUKA plné pestrosti — množina
 *   kandidátů se s aktuálním jídlem mění (aktuální jídlo je vždy vyloučené),
 *   takže po pár kolech typicky sklouzne do cyklu mezi dvěma zbylými
 *   kandidáty. Garantuje jen tohle: `attempt=0` dá dnešní chování
 *   (nejbližší), a další pokusy o TÉŽE cílové kalorii navštíví i jiné
 *   kandidáty, než by čistě deterministický `within[0]` kdy ukázal — ověřeno
 *   ručně na produkčním případu (`standard/breakfast` @ 440 kcal): `within[0]`
 *   dá `Ovesná káše -> Vejce -> Ovesná kaše -> …` (Šunka se neukáže nikdy),
 *   round-robin dá `Ovesná kaše -> Šunka -> Vejce -> Šunka -> Vejce -> …`
 *   (všechny tři se objeví do 3 pokusů, pak cyklus Šunka/Vejce). Volající
 *   (lib/planMealReplace.js) musí tohle číslo perzistovat na jídle mezi
 *   voláními (`replacement_attempt`) — bez toho degeneruje zpátky na
 *   `attempt=0` pořád dokola.
 */
export function pickSimpleStartMealAlternative({
  mealType,
  currentTitle,
  bodyMetrics = {},
  excludeTitles = [],
  targetKcal = null,
  requireLibraryRecipe = false,
  variationSeed = 0,
}) {
  const type = String(mealType || 'lunch').toLowerCase();
  const dk = dietKey(bodyMetrics);
  const pool = START_MEAL_TEMPLATES[dk]?.[type] || START_MEAL_TEMPLATES.standard[type] || [];
  const exclusions = parseDietaryExclusions(bodyMetrics);
  const currentNorm = normalizeTitle(currentTitle).toLowerCase();
  const excluded = new Set(
    [currentNorm, ...excludeTitles.map((t) => normalizeTitle(t).toLowerCase())].filter(Boolean)
  );

  const candidates = [];
  for (const tpl of pool) {
    const title = normalizeTitle(tpl.name_cs);
    if (!title || excluded.has(title.toLowerCase())) continue;
    if (!isTemplateAllowedForExclusions(tpl, exclusions)) continue;
    const lib = SIMPLE_START_RECIPES.find(
      (r) => r.meal_type === type && normalizeTitle(r.title).toLowerCase() === title.toLowerCase()
    );
    // ROZSYNCHRONIZACE START_MEAL_TEMPLATES / SIMPLE_START_RECIPES (14 ze 60
    // šablon nemá knihovní recept, naměřeno). Bez tohohle picker klidně
    // vybere šablonu bez receptu — ta se dál staví přes tpl.fallback_meal_template
    // a POSÍLÁ SE do resolveSimpleStartLocalSlot(), jehož nouzová cesta
    // (buildStartSafeFallbackMeal) vybírá NEZÁVISLE na tom, co bylo vybráno
    // tady. U standard/breakfast je taková šablona navíc nejblíž běžným
    // kalorickým cílům, takže se volila DETERMINISTICKY — produkční nález,
    // PR #233. Netýká se enforceDietaryPublishGate: tam je i šablona bez
    // receptu lepší než ponechaná dietní vada.
    if (requireLibraryRecipe && !lib) continue;
    const baseKcal = lib?.calories ?? tpl.fallback_meal_template?.kcal ?? 500;
    candidates.push({ tpl, title, baseKcal, lib });
  }

  if (!targetKcal) {
    if (candidates.length) return candidates[0];
    return null;
  }

  candidates.sort((a, b) => Math.abs(a.baseKcal - targetKcal) - Math.abs(b.baseKcal - targetKcal));
  const within = candidates.filter((c) => Math.abs(c.baseKcal - targetKcal) <= targetKcal * 0.2);
  if (!within.length) return candidates[0] ?? null;
  // Round-robin, ne Math.random(): stejný vstup musí dát stejný výstup, ať
  // jde testovat bez mockování náhody. `attempt=0` = `within[0]` (dnešní
  // chování prvního kliknutí beze změny) — viz JSDoc výš k `variationSeed`.
  // `Math.trunc` + druhý `% within.length` ošetří necelé i záporné vstupy —
  // `within[1.7]` by jinak bylo `undefined` (necelý index není platný klíč pole).
  const rawSeed = Number(variationSeed);
  const attempt = Number.isFinite(rawSeed) ? Math.trunc(rawSeed) : 0;
  const idx = ((attempt % within.length) + within.length) % within.length;
  return within[idx];
}

/**
 * @param {object} params
 * @param {boolean} [params.requireLibraryRecipe] viz pickSimpleStartMealAlternative výš.
 * @param {number} [params.variationSeed] viz pickSimpleStartMealAlternative výš.
 */
export function buildReplacementStructuredMeal({
  mealType,
  currentTitle,
  bodyMetrics,
  excludeTitles,
  targetKcal,
  requireLibraryRecipe = false,
  variationSeed = 0,
}) {
  const picked = pickSimpleStartMealAlternative({
    mealType,
    currentTitle,
    bodyMetrics,
    variationSeed,
    excludeTitles,
    targetKcal,
    requireLibraryRecipe,
  });
  if (!picked) return null;

  const { tpl, title, lib } = picked;
  if (lib) {
    const meal = buildSimpleStartLibraryMeal(title, mealType);
    if (meal && !mealContainsExcludedFood(meal, parseDietaryExclusions(bodyMetrics))) return meal;
  }

  const fb = tpl.fallback_meal_template || {};
  return {
    type: mealType,
    name_cs: title,
    display_name_cs: title,
    display_name: title,
    calories: fb.kcal ?? targetKcal,
    protein_g: fb.protein_g,
    carbs_g: fb.carbs_g,
    fat_g: fb.fat_g,
    kcal: fb.kcal ?? targetKcal,
    catalog_source: 'simple_start_fallback',
    recipe: { source: 'simple_start_fallback', title },
    recipe_verified: true,
    shopping_ingredient_lines: fb.shopping_ingredient_lines || [],
    simple_start_mode: true,
    planner_source: 'meal_replacement',
  };
}
