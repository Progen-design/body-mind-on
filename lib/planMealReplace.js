/**
 * Nahrazení jednoho jídla ve structured plánu (START / lokální knihovna).
 */
import { buildReplacementStructuredMeal } from './simpleStartMealReplacement.js';
import { resolveSimpleStartLocalSlot } from './startSimpleMealFilter.js';
import { isSameSimpleStartMeal } from './simpleStartRecipeLibrary.js';
import {
  sumScaledDayKcal,
  slotTargetKcal,
  planMealTypeToWeightKey,
} from './nutrition/portionScaling.js';
import { fillDayCaloriesByAddingLibraryMeals, enforceDayCalorieBand } from './nutrition/calorieHonesty.js';
import { renderPlanHtmlFromStructured } from './planRenderer.js';
import { stripPlanMediaAttrsFromHtml } from './emailTemplates.js';

function mealTitle(meal) {
  return meal?.display_name_cs || meal?.name_cs || meal?.display_name || '';
}

/**
 * @param {object} structuredPlan
 * @param {number} daySlotIndex - index 0..6 v poli structuredPlan.days (den platnosti plánu)
 * @param {number} mealIndex
 * @param {object} bodyMetrics
 */
export async function replaceMealInStructuredPlan(structuredPlan, daySlotIndex, mealIndex, bodyMetrics = {}) {
  if (!structuredPlan?.days?.length) {
    throw new Error('STRUCTURED_PLAN_MISSING');
  }
  const slot = Number(daySlotIndex);
  const day = Number.isFinite(slot) && slot >= 0 && slot < structuredPlan.days.length
    ? structuredPlan.days[slot]
    : structuredPlan.days.find((d) => Number(d.day_index) === slot);
  if (!day?.meals?.length) throw new Error('DAY_NOT_FOUND');

  const current = day.meals[mealIndex] || day.meals.find((m, i) => i === mealIndex);
  if (!current) throw new Error('MEAL_NOT_FOUND');

  const mealType = current.type || 'lunch';
  const currentTitle = mealTitle(current);
  const dailyTarget = Number(structuredPlan?.targets?.calories_per_day)
    || Number(bodyMetrics?.calories_target)
    || Number(day.daily_target_kcal)
    || 2200;
  const mealsPerDay = day.meals.length;
  const slotTarget = slotTargetKcal(
    dailyTarget,
    mealsPerDay,
    planMealTypeToWeightKey(mealType)
  );

  const excludeTitles = day.meals.map((m) => mealTitle(m)).filter(Boolean);
  // KOLIKÁTÁ ZÁMĚNA TOHOTO SLOTU (PROMPT_PRO_CODE.md bod C). `current` je
  // jídlo PŘED touhle záměnou — pokud už samo neslo `replacement_attempt`
  // (byl vyměněný dřív), pokračuje se v počítání odtud. Bez tohohle by
  // round-robin v pickSimpleStartMealAlternative() dostával pořád
  // `variationSeed=0` a zdegeneroval zpátky na dnešní `within[0]` navěky —
  // viz test „replacement_attempt musí přežít záměnu" u tohodle souboru.
  const priorReplacementAttempt = Number(current?.replacement_attempt) || 0;
  const replacement = buildReplacementStructuredMeal({
    mealType,
    currentTitle,
    bodyMetrics,
    excludeTitles,
    targetKcal: slotTarget,
    variationSeed: priorReplacementAttempt,
    // Jen tady, ne pro enforceDietaryPublishGate (lib/dietaryPublishGate.js),
    // které stejnou funkci volá taky: tam je i náhrada bez knihovního receptu
    // lepší než ponechaná dietní vada, takže pro něj zůstává výchozí `false`
    // (nefiltrovat). Tady jde o „dej mi jiné jídlo, ne cokoli" — šablona bez
    // receptu vede rovnou do buildStartSafeFallbackMeal() níž a odtamtud se
    // dřív vracel snapshot nezávislý na tom, co bylo vybráno (viz níž).
    requireLibraryRecipe: true,
  });
  if (!replacement || mealTitle(replacement).toLowerCase() === currentTitle.toLowerCase()) {
    throw new Error('NO_ALTERNATIVE');
  }

  const slotMeal = {
    type: mealType,
    name_cs: replacement.display_name_cs || replacement.name_cs,
    target_kcal: slotTarget,
    simple_start_mode: true,
    planner_source: 'meal_replacement',
    fallback_meal_template: {
      name_cs: replacement.display_name_cs || replacement.name_cs,
      kcal: replacement.kcal || replacement.calories,
      protein_g: replacement.protein_g,
      carbs_g: replacement.carbs_g,
      fat_g: replacement.fat_g,
    },
  };

  // VYLOUČENÍ PRO NOUZOVOU CESTU (lib/startSimpleMealFilter.js).
  //
  // `replacement` výš je zaručeně jiné jídlo (kontrola o dva řádky výš) —
  // ale `resolveSimpleStartLocalSlot()` umí `replacement` samo zahodit, když
  // `SIMPLE_START_RECIPES` neumí jeho název postavit, a propadnout se do
  // `buildStartSafeFallbackMeal()`. Ta bez vyloučení vybírala nezávisle na
  // tom, co se nahrazuje — celý `day.meals` (včetně `current`) jde proto na
  // vstup, stejná množina jako `excludeTitles` výš, jen jako syrová jídla,
  // ne jen názvy (fallback porovnává i catalog_id/recipe_id).
  const { meal: resolved } = resolveSimpleStartLocalSlot(slotMeal, slotTarget, mealIndex, bodyMetrics, day.meals);
  const nextMeal = resolved || replacement;

  // DRUHÁ KONTROLA — na `nextMeal`, ne jen na `replacement` výš.
  //
  // Tohle je právě ta kontrola, co v produkci chyběla: `replacement` je vždy
  // jiné jídlo, ale `resolveSimpleStartLocalSlot()` mu to jméno cestou umí
  // zahodit a vrátit něco jiného — v nejhorším případě přesně `current`.
  // Musí běžet PŘED zápisem do `day.meals[mealIndex]` o řádek níž: jinak by
  // se plán stihl přepsat a kalorie přepočítat ještě předtím, než se cokoli
  // ověří, a endpoint by na chybu odpověděl s plánem už tiše pozměněným.
  if (isSameSimpleStartMeal(nextMeal, current)) {
    throw new Error('NO_ALTERNATIVE');
  }

  // `replacement_attempt` MUSÍ jít EXPLICITNĚ za spread `...nextMeal` — nový
  // objekt z buildReplacementStructuredMeal()/resolveSimpleStartLocalSlot()
  // žádné počítadlo nenese, takže bez tohohle přiřazení by se při každé další
  // záměně čtlo jako 0 a round-robin výš by dostával pořád `variationSeed=0`.
  day.meals[mealIndex] = {
    ...nextMeal,
    type: mealType,
    replaced_from: currentTitle,
    replacement_attempt: priorReplacementAttempt + 1,
  };

  fillDayCaloriesByAddingLibraryMeals(day.meals, dailyTarget);
  const band = enforceDayCalorieBand(day.meals, dailyTarget, { tolerance: 0.10 });
  const daySum = band.achieved_kcal ?? sumScaledDayKcal(day.meals);
  if (!band.within_band && (band.over_target_kcal || 0) > 0) {
    throw new Error('DAY_KCAL_OUT_OF_TOLERANCE');
  }

  day.daily_target_kcal = dailyTarget;
  day.daily_achieved_kcal = daySum;
  day.calorie_under_target = band.under_target === true;
  day.calorie_shortfall_kcal = band.shortfall_kcal ?? 0;

  const planHtml = stripPlanMediaAttrsFromHtml(renderPlanHtmlFromStructured(structuredPlan, bodyMetrics));

  return {
    structuredPlan,
    planHtml,
    meal: nextMeal,
    day_kcal: daySum,
    previous_title: currentTitle,
    new_title: mealTitle(nextMeal),
  };
}

export default replaceMealInStructuredPlan;
