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
 *   nejbližší kalorický kandidát. Oprava je round-robin přes STABILNÍ
 *   seznam kandidátů v toleranci (viz `stableUniverse` níž) — dokud se
 *   MEZI ZÁMĚNAMI NEMĚNÍ cílová kalorie ani ostatní jídla dne (typický
 *   případ „klikám pořád na tentýž slot"), rotace za N pokusů projde
 *   VŠECHNY kandidáty v toleranci přesně jednou, ne jen 2 z nich — na
 *   rozdíl od první verze týhle opravy, kde se `within` počítalo PO
 *   vyloučení aktuálního jídla, takže se přeskládávalo s každou záměnou
 *   a paritu `variationSeed` to zamklo na dvojici (produkční nález PO PR
 *   #237: „Cottage s pečivem" se u svačiny neukázalo nikdy). Pokud se
 *   mezitím změní TARGET (typicky přepočtem `slotTargetKcal` po záměně
 *   JINÉHO jídla dne) nebo množina ostatních jídel, stabilní seznam se
 *   přepočítá znovu a rotace začne odznova — to je legitimní změna vstupu,
 *   ne regrese týhle opravy. Volající (lib/planMealReplace.js) musí
 *   `attempt` perzistovat na jídle mezi voláními (`replacement_attempt`) —
 *   bez toho se pořád posílá `attempt=0` a rotace se nikdy nepohne.
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
  // `excludeTitles` (volající, lib/planMealReplace.js) posílá VŠECHNA
  // dnešní jídla — včetně toho, co je zrovna v TOMHLE slotu. Kdyby to tu
  // zůstalo, `stableUniverse` níž by se s každou záměnou zase přeskládala
  // (currentNorm by v ní pořád zmizel a naskočil), přesně ten produkční bug,
  // co má tenhle seznam odstranit. Aktuální jídlo se řeší samostatně (skip
  // v rotaci níž) — tady se vylučuje jen to, co je JINDE v plánu dne.
  const otherExcludedNorm = new Set(
    excludeTitles
      .map((t) => normalizeTitle(t).toLowerCase())
      .filter((t) => t && t !== currentNorm)
  );

  /**
   * @param {Set<string>} excludedNorm názvy (normalizované, malými), které
   *   se do výsledku nemají dostat vůbec
   */
  function buildCandidates(excludedNorm) {
    const out = [];
    for (const tpl of pool) {
      const title = normalizeTitle(tpl.name_cs);
      if (!title || excludedNorm.has(title.toLowerCase())) continue;
      if (!isTemplateAllowedForExclusions(tpl, exclusions)) continue;
      const lib = SIMPLE_START_RECIPES.find(
        (r) => r.meal_type === type && normalizeTitle(r.title).toLowerCase() === title.toLowerCase()
      );
      // ROZSYNCHRONIZACE START_MEAL_TEMPLATES / SIMPLE_START_RECIPES (14 ze
      // 60 šablon nemá knihovní recept, naměřeno). Bez tohohle picker klidně
      // vybere šablonu bez receptu — ta se dál staví přes
      // tpl.fallback_meal_template a POSÍLÁ SE do resolveSimpleStartLocalSlot(),
      // jehož nouzová cesta (buildStartSafeFallbackMeal) vybírá NEZÁVISLE na
      // tom, co bylo vybráno tady. U standard/breakfast je taková šablona
      // navíc nejblíž běžným kalorickým cílům, takže se volila
      // DETERMINISTICKY — produkční nález, PR #233. Netýká se
      // enforceDietaryPublishGate: tam je i šablona bez receptu lepší než
      // ponechaná dietní vada.
      if (requireLibraryRecipe && !lib) continue;
      const baseKcal = lib?.calories ?? tpl.fallback_meal_template?.kcal ?? 500;
      out.push({ tpl, title, baseKcal, lib });
    }
    return out;
  }

  // Kandidáti BEZ aktuálního jídla — beze změny oproti dřívějšku. Používá se
  // pro `!targetKcal` (enforceDietaryPublishGate) a jako poslední záchrana
  // níž, když stabilní seznam nemá nikoho v toleranci.
  const excludedWithCurrent = new Set([currentNorm, ...otherExcludedNorm].filter(Boolean));
  const candidates = buildCandidates(excludedWithCurrent);

  if (!targetKcal) {
    if (candidates.length) return candidates[0];
    return null;
  }

  const distFromTarget = (c) => Math.abs(c.baseKcal - targetKcal);
  const inTolerance = (c) => distFromTarget(c) <= targetKcal * 0.2;
  const legacyFallback = () => {
    const sorted = [...candidates].sort((a, b) => distFromTarget(a) - distFromTarget(b));
    const within = sorted.filter(inTolerance);
    return (within[0] || sorted[0]) ?? null;
  };

  // STABILNÍ SEZNAM — produkční nález PO PR #237. `within` se předtím
  // počítal z `candidates` (BEZ aktuálního jídla), takže se s každou
  // záměnou přeskládal — obsah i pořadí se měnily podle toho, co bylo
  // zrovna vyloučené. Round-robin nad takhle pohyblivým seznamem zamkl
  // paritu `variationSeed` na dvojici kandidátů a třetího (`Cottage
  // s pečivem` u svačiny @ 308 kcal) neukázal nikdy — to je přesně to, co
  // ověřila produkce po nasazení. Řešení: seznam kandidátů v toleranci se
  // počítá NAD CELÝM poolem (aktuální jídlo se z něj NEVYLUČUJE), takže je
  // pro daný slot+cíl+den STEJNÝ při každém volání bez ohledu na to, co je
  // zrovna na talíři — a teprve z pevné rotace nad ním se aktuální jídlo
  // přeskočí (o řádek níž).
  const stableUniverse = buildCandidates(otherExcludedNorm);
  stableUniverse.sort((a, b) => distFromTarget(a) - distFromTarget(b));
  const stableWithin = stableUniverse.filter(inTolerance);
  if (!stableWithin.length) return legacyFallback();

  // Round-robin, ne Math.random(): stejný vstup musí dát stejný výstup, ať
  // jde testovat bez mockování náhody. `Math.trunc` + druhý `%` ošetří
  // necelé i záporné vstupy — `stableWithin[1.7]` by jinak bylo `undefined`.
  const rawSeed = Number(variationSeed);
  const attempt = Number.isFinite(rawSeed) ? Math.trunc(rawSeed) : 0;
  let idx = ((attempt % stableWithin.length) + stableWithin.length) % stableWithin.length;
  // Aktuální jídlo se přeskočí AŽ TADY, po spočítání rotace na pevném
  // seznamu — ne dřív. `attempt=0` proto dá stejný výsledek jako dřív:
  // buď globálně nejbližší kandidát (když jím současné jídlo není), nebo
  // druhý nejbližší (když jím je).
  if (stableWithin[idx].title.toLowerCase() === currentNorm) {
    idx = (idx + 1) % stableWithin.length;
  }
  if (stableWithin[idx].title.toLowerCase() === currentNorm) {
    // Jediný kandidát v toleranci JE aktuální jídlo (stableWithin.length===1)
    // — není kam se otočit, kalorickou toleranci ale pořád nepouštíme.
    return legacyFallback();
  }
  return stableWithin[idx];
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
