/**
 * Tvrdý dietní publish gate před uložením / publikací plánu.
 * Priorita: diet_type > dietary_restrictions > alergeny > katalog/AI text.
 */
import {
  parseDietaryExclusions,
  mealContainsExcludedFood,
  textContainsExcludedFood,
} from './dietaryExclusions.js';
import { buildReplacementStructuredMeal } from './simpleStartMealReplacement.js';
import { buildSimpleStartMealSkeleton } from './services/simpleMealPlannerAgent.js';
import { resolveSimpleStartLocalSlot } from './startSimpleMealFilter.js';
import { planMealTypeToWeightKey, slotTargetKcal } from './nutrition/portionScaling.js';
import { fillDayCaloriesByAddingLibraryMeals } from './nutrition/calorieHonesty.js';
import {
  findGlutenTerm,
  findRestrictedTerm,
  isExplicitlyGlutenFree,
} from './dietCriticalTerms.js';

const MEAT_FISH_TERMS = [
  'maso', 'ryba', 'ryby', 'drubez', 'drůbež', 'kuře', 'kure', 'kuřec', 'kurec',
  'hověz', 'hovez', 'vepř', 'vepr', 'salmon', 'tuna', 'tuňák', 'tunak', 'losos',
  'chicken', 'beef', 'fish', 'meat', 'pork', 'turkey', 'bacon', 'šunka', 'sunka',
  'krůt', 'krut', 'jehněč', 'jehnec',
];

const VEGAN_EXTRA_TERMS = [
  'vejce', 'vejci', 'egg', 'mléko', 'mleko', 'milk', 'sýr', 'syr', 'cheese',
  'tvaroh', 'jogurt', 'yogurt', 'med', 'želatina', 'zelatina', 'gelatin',
  'smetan', 'slehack', 'butter', 'máslo', 'maslo', 'whey', 'casein',
];

// Lepkové výrazy, bezlepkové výjimky i produktové rozhodnutí o ovsu žijí
// v lib/dietCriticalTerms.js. Tady schválně žádný seznam není — brána byla
// jedno ze tří míst, kde stál vlastní.

/**
 * @param {object|null|undefined} bm
 */
export function buildDietaryPublishRules(bm) {
  const dietType = String(bm?.diet_type || 'standard').toLowerCase();
  const exclusions = parseDietaryExclusions(bm);
  const combined = [
    bm?.foods_to_avoid,
    bm?.dietary_restrictions,
    bm?.allergies,
  ].filter(Boolean).join(' ').toLowerCase();

  const glutenFree = dietType === 'gluten_free' || dietType === 'gluten-free'
    || combined.includes('lep') || combined.includes('gluten');
  const lactoseFree = dietType === 'lactose_free' || dietType === 'lactose-free'
    || exclusions.dairyExcluded
    || combined.includes('laktoz') || combined.includes('lactose');

  return {
    dietType,
    exclusions,
    glutenFree,
    lactoseFree,
    vegetarian: dietType === 'vegetarian',
    vegan: dietType === 'vegan',
  };
}

/**
 * Co uživatel v plánu opravdu čte — názvy jídla a řádky surovin. Jazyk je
 * jedno: když v nákupním seznamu stojí „1 slice of wholemeal bread“, uživatel
 * to vidí a je to lepek.
 *
 * `recipe.title` tu ZÁMĚRNĚ NENÍ. Je to `row.name_en`, tedy anglický
 * marketingový název, a ten o složení nevypovídá: „Banana Bread Nice Cream“
 * (id 597) je zmrzlina z banánů, skořice a vlašských ořechů. Čtením názvu se
 * nic nezíská — u všech 16 receptů změřených 10. 8. 2026 je lepek v surovinách
 * — a prohraje se na falešných blocích. České názvy (`name_cs`,
 * `display_name_cs`) se čtou dál.
 */
function mealTextBlob(meal) {
  const parts = [
    meal?.display_name_cs,
    meal?.display_name,
    meal?.name_cs,
    meal?.name,
    meal?.title,
    meal?.recipe?.title_cs,
    meal?.ai_name,
  ];
  if (Array.isArray(meal?.shopping_ingredient_lines)) {
    parts.push(...meal.shopping_ingredient_lines.map((l) => (typeof l === 'string' ? l : l?.name || '')));
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function textHasAnyTerm(text, terms) {
  return findRestrictedTerm(text, terms) !== null;
}

/**
 * ANGLICKÁ FAKTA o jídle — surovinové názvy a původní řádky ze Spoonaculáru.
 *
 * PROČ brána čte i angličtinu. Změřeno na produkci 10. 8. 2026: proti tehdejšímu
 * českému seznamu neslo lepek jen v anglických datech 16 aktivních receptů —
 * český překlad ho zahodil. „Poached Egg With Spinach and Tomato“ je česky
 * „Smažené vejce se špenátem a rajčaty“, v tom není ani stopa po toustu, na
 * kterém to leží. Brána, která čte jen češtinu, je nejvýš tak dobrá jako
 * překlad. (Po doplnění českých výrazů zbyly dva — id 509 a 564, „english
 * muffin“ u vajec Benedikt. Číst angličtinu je pojistka proti dalším, ne
 * náhrada za český seznam.)
 *
 * PROČ TU NENÍ `name_en` ANI `recipe.title`. Anglický NÁZEV je marketing a
 * idiom, ne složení: „Banana Bread Nice Cream“ (id 597) je zmrzlina z banánů —
 * banán, skořice, vanilka, vlašské ořechy — a slovo „bread“ v názvu by ji
 * bezlepkovému uživateli sebralo. Naopak seznam surovin lže málokdy. U všech
 * 16 změřených receptů byl lepek v surovinách, ne jen v názvu, takže se čtením
 * názvu nic nezíská a prohraje se na falešných blocích.
 *
 * ČESKÝ název se čte dál (mealTextBlob) — ten uživatel opravdu čte.
 *
 * @param {object|null|undefined} meal
 * @returns {string}
 */
function mealEnglishFactBlob(meal) {
  /** @type {string[]} */
  const parts = [];
  for (const list of [meal?.recipe?.ingredients, meal?.ingredients]) {
    if (!Array.isArray(list)) continue;
    for (const ing of list) {
      if (!ing || typeof ing !== 'object') continue;
      if (ing.name_en) parts.push(String(ing.name_en));
      if (ing.original) parts.push(String(ing.original));
    }
  }
  return parts.join(' ');
}

/**
 * @param {string} csText text, který uživatel čte
 * @param {string} enFactText anglická surovinová data, když jsou
 * @returns {'gluten_free'|'gluten_free_source_en'|null}
 */
function glutenViolationCode(csText, enFactText) {
  // Označení „bezlepkový“ platí na CELÉ jídlo, ne na jednu jazykovou plochu.
  // Recept ho napíše jednou, typicky česky do názvu. Když se to vyhodnocovalo
  // zvlášť pro češtinu a zvlášť pro angličtinu, „Bezlepkový dýňový chléb“
  // (id 565) prošel českou kontrolou a spadl na anglické, protože jedna
  // surovina má v `original` větu „…to top off the bread“.
  const declaredGlutenFree = isExplicitlyGlutenFree(csText) || isExplicitlyGlutenFree(enFactText);
  if (declaredGlutenFree) return null;

  if (findGlutenTerm(csText)) return 'gluten_free';
  // Vlastní kód, ne 'gluten_free' — „lepek je vidět jen v angličtině“ je jiná
  // porucha (rozbitý překlad) než „lepek je v plánu“ a v logu se to nesmí
  // slít do jednoho.
  if (enFactText && findGlutenTerm(enFactText)) return 'gluten_free_source_en';
  return null;
}

/**
 * Porušení diety čitelné z HOLÉHO TEXTU. Používá se tam, kde není strukturovaný
 * plán — typicky nouzová HTML šablona, která ingredience vůbec nemá.
 *
 * @param {string} text jeden segment (řádek / položka), ne celý dokument
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {string|null}
 */
export function textDietaryViolation(text, rules) {
  const norm = String(text || '').toLowerCase();
  if (!norm) return null;

  if (rules.vegetarian && textHasAnyTerm(norm, MEAT_FISH_TERMS)) {
    return 'vegetarian_meat_fish';
  }
  if (rules.vegan && (textHasAnyTerm(norm, MEAT_FISH_TERMS) || textHasAnyTerm(norm, VEGAN_EXTRA_TERMS))) {
    return 'vegan_animal_product';
  }
  // Holý text anglická surovinová data nemá — proto druhý argument prázdný.
  if (rules.glutenFree) {
    const gluten = glutenViolationCode(norm, '');
    if (gluten) return gluten;
  }
  if (textContainsExcludedFood(norm, rules.exclusions)) {
    return rules.lactoseFree ? 'lactose_free' : 'dietary_exclusion';
  }
  return null;
}

/**
 * @param {object|null|undefined} meal
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {string|null} violation code
 */
export function mealDietaryViolation(meal, rules) {
  if (!meal) return null;
  const text = mealTextBlob(meal);
  // Stejný důvod jako u lepku: překlad umí zahodit i slaninu nebo ančovičky.
  const enFacts = mealEnglishFactBlob(meal);
  const bothLangs = `${text} ${enFacts}`;

  if (rules.vegetarian && textHasAnyTerm(bothLangs, MEAT_FISH_TERMS)) {
    return 'vegetarian_meat_fish';
  }
  if (rules.vegan && (textHasAnyTerm(bothLangs, MEAT_FISH_TERMS) || textHasAnyTerm(bothLangs, VEGAN_EXTRA_TERMS))) {
    return 'vegan_animal_product';
  }
  if (rules.glutenFree) {
    const gluten = glutenViolationCode(text, enFacts);
    if (gluten) return gluten;
  }
  if (rules.lactoseFree && mealContainsExcludedFood(meal, rules.exclusions)) {
    return 'lactose_free';
  }
  if (mealContainsExcludedFood(meal, rules.exclusions)) {
    return 'dietary_exclusion';
  }
  for (const term of rules.exclusions.rawTerms || []) {
    if (term && textContainsExcludedFood(text, { blockedTerms: [term] })) {
      return 'explicit_exclusion';
    }
  }
  return null;
}

/**
 * @param {object} planJson
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {Array<{ dayIndex: number, mealIndex: number, code: string }>}
 */
export function findDietaryViolations(planJson, rules) {
  const hits = [];
  const days = planJson?.days || [];
  for (let di = 0; di < days.length; di++) {
    const meals = days[di]?.meals || [];
    for (let mi = 0; mi < meals.length; mi++) {
      const code = mealDietaryViolation(meals[mi], rules);
      if (code) hits.push({ dayIndex: di, mealIndex: mi, code });
    }
  }
  return hits;
}

/**
 * Bloky, na kterých se HTML láme na „řádky“. Kontroluje se PO SEGMENTECH, ne
 * celý dokument najednou: jedno slovo „bezlepkový“ kdekoli v patičce by jinak
 * vybílilo celý plán, protože `isExplicitlyGlutenFreeVariant` je myšlená na
 * název jednoho jídla.
 */
const HTML_BLOK = /<(?:br|\/p|\/li|\/tr|\/td|\/th|\/h[1-6]|\/div)[^>]*>/gi;

/**
 * @param {string} html
 * @returns {string[]}
 */
export function planHtmlToTextSegments(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(HTML_BLOK, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * @param {string} html
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {Array<{ text: string, code: string }>}
 */
export function findDietaryViolationsInHtml(html, rules) {
  const hits = [];
  for (const segment of planHtmlToTextSegments(html)) {
    const code = textDietaryViolation(segment, rules);
    if (code) hits.push({ text: segment.slice(0, 120), code });
  }
  return hits;
}

/**
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @returns {boolean} má uživatel vůbec nějaké dietní omezení?
 */
export function hasAnyDietaryRestriction(rules) {
  return !!(
    rules?.glutenFree
    || rules?.lactoseFree
    || rules?.vegetarian
    || rules?.vegan
    || rules?.exclusions?.dairyExcluded
    || rules?.exclusions?.cheeseExcluded
    || (rules?.exclusions?.blockedTerms || []).length > 0
    || (rules?.exclusions?.rawTerms || []).length > 0
  );
}

/**
 * BRÁNA NA HRANICI PUBLIKACE. Poslední kontrola předtím, než se plán dostane
 * k uživateli — ať přišel odkudkoli.
 *
 * PROČ NESTAČILA `enforceDietaryPublishGate`. Ta sedí UVNITŘ
 * runUnifiedPlanPipeline. 10. 8. 2026 pipeline bezlepkovému uživateli plán
 * správně odmítla ('Dietary publish gate failed'), načež nouzová větev
 * v pages/api/body-metrics.js pipeline obešla, sáhla po statické HTML šabloně
 * a e-mail odeslala. Uživatel dostal plán s chlebem, těstovinami a ovesnými
 * vločkami. Kontrola uvnitř jedné cesty nehlídá cesty ostatní.
 *
 * ČÍM SE KONTROLUJE. Když je k dispozici strukturovaný plán, platí ON — je
 * autoritativní, kontroluje se po jídlech včetně ingrediencí a plán, který jím
 * prošel, se tu nesmí zablokovat podruhé kvůli hrubšímu textovému hledání.
 * Textový sken je až náhrada pro případ, kdy strukturovaný plán NENÍ, což je
 * přesně ta nouzová šablona.
 *
 * Bez podkladů (ani plán, ani HTML) i bez body_metrics se NEPUBLIKUJE. Neznámá
 * dieta se nesmí chovat jako žádná dieta — tak vznikla tahle díra.
 *
 * @param {{ planJson?: object|null, planHtml?: string|null, bm?: object|null }} p
 * @returns {{ ok: boolean, reason: string|null, checked: string, violations: number, sample: Array<object> }}
 */
export function assertPlanPublishableForDiet(p) {
  const planJson = p?.planJson ?? null;
  const planHtml = p?.planHtml ?? null;
  const bm = p?.bm ?? null;

  if (!bm) {
    return { ok: false, reason: 'no_body_metrics', checked: 'nothing', violations: 1, sample: [] };
  }

  const rules = buildDietaryPublishRules(bm);
  if (!hasAnyDietaryRestriction(rules)) {
    return { ok: true, reason: null, checked: 'no_restrictions', violations: 0, sample: [] };
  }

  if (planJson?.days?.length) {
    const hits = findDietaryViolations(planJson, rules);
    return {
      ok: hits.length === 0,
      reason: hits.length ? hits[0].code : null,
      checked: 'plan_json',
      violations: hits.length,
      sample: hits.slice(0, 5),
    };
  }

  if (planHtml && String(planHtml).trim()) {
    const hits = findDietaryViolationsInHtml(planHtml, rules);
    return {
      ok: hits.length === 0,
      reason: hits.length ? hits[0].code : null,
      checked: 'plan_html',
      violations: hits.length,
      sample: hits.slice(0, 5),
    };
  }

  return { ok: false, reason: 'nothing_to_verify', checked: 'nothing', violations: 1, sample: [] };
}

function cloneMealSlot(meal, replacement) {
  if (!replacement) return meal;
  return {
    ...meal,
    ...replacement,
    type: meal.type || replacement.type,
    display_name_cs: replacement.display_name_cs || replacement.name_cs,
    catalog_source: replacement.catalog_source || 'simple_start_library',
    recipe_verified: replacement.recipe_verified !== false,
    verification_source: replacement.verification_source || 'dietary_publish_gate',
  };
}

function resolveSkeletonMealsForPlan(skeleton, bodyMetrics) {
  const dailyTarget = Number(skeleton.targets?.calories_per_day) || 2200;
  const mealsPerDay = skeleton.meal_plan?.meals_per_day || 3;
  const outDays = [];
  for (const day of skeleton.meal_plan?.days || []) {
    const dayMeals = [];
    for (let mi = 0; mi < (day.meals || []).length; mi++) {
      const slotMeal = day.meals[mi];
      const slotTarget = slotTargetKcal(
        dailyTarget,
        mealsPerDay,
        planMealTypeToWeightKey(slotMeal.type || 'lunch'),
      );
      const { meal } = resolveSimpleStartLocalSlot(slotMeal, slotTarget, mi, bodyMetrics);
      dayMeals.push(meal);
    }
    fillDayCaloriesByAddingLibraryMeals(dayMeals, dailyTarget);
    outDays.push({ ...day, meals: dayMeals });
  }
  return outDays;
}

/**
 * @param {object} planJson
 * @param {object} bm body_metrics
 * @returns {{ ok: boolean, planJson: object, replaced: number, fallbackUsed: boolean, violations: number }}
 */
export function enforceDietaryPublishGate(planJson, bm) {
  if (!planJson?.days?.length) {
    return { ok: false, planJson, replaced: 0, fallbackUsed: false, violations: 1 };
  }

  const rules = buildDietaryPublishRules(bm);
  let working = JSON.parse(JSON.stringify(planJson));
  let replaced = 0;

  const violations1 = findDietaryViolations(working, rules);
  if (violations1.length) {
    const usedTitles = new Set();
    for (const hit of violations1) {
      const day = working.days[hit.dayIndex];
      const meal = day?.meals?.[hit.mealIndex];
      if (!meal) continue;
      const targetKcal = Number(meal.kcal) || slotTargetKcal(
        Number(working.targets?.calories_per_day) || 2200,
        (day.meals || []).length,
        planMealTypeToWeightKey(meal.type || 'lunch'),
      );
      const replacement = buildReplacementStructuredMeal({
        mealType: meal.type || 'lunch',
        currentTitle: meal.display_name_cs || meal.name_cs || '',
        bodyMetrics: bm,
        excludeTitles: [...usedTitles],
        targetKcal,
      });
      if (replacement) {
        day.meals[hit.mealIndex] = cloneMealSlot(meal, replacement);
        usedTitles.add(replacement.display_name_cs || replacement.name_cs || '');
        replaced += 1;
      }
    }
  }

  const violations2 = findDietaryViolations(working, rules);
  if (violations2.length) {
    try {
      const skeleton = buildSimpleStartMealSkeleton({ bodyMetrics: bm });
      const safeDays = resolveSkeletonMealsForPlan(skeleton, bm);
      for (let i = 0; i < working.days.length && i < safeDays.length; i++) {
        working.days[i] = {
          ...working.days[i],
          meals: safeDays[i].meals,
        };
      }
      replaced += violations2.length;
    } catch {
      return {
        ok: false,
        planJson: working,
        replaced,
        fallbackUsed: true,
        violations: violations2.length,
      };
    }
  }

  const finalViolations = findDietaryViolations(working, rules);
  return {
    ok: finalViolations.length === 0,
    planJson: working,
    replaced,
    fallbackUsed: violations2.length > 0,
    violations: finalViolations.length,
  };
}
