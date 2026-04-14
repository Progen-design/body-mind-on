/**
 * lib/services/planOrchestrator.js
 * Orchestrace: OpenAI → Spoonacular → wger → finální plán.
 * Větev v6: planOrchestrator_newFormat (isV6Format + enrichAgentPlanV6).
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md
 */
import { openai } from '../openai';
import { aggregateShoppingIngredientLinesFromStructuredPlan } from '../spoonacularShopping';
import {
  buildProfileTemplateMealPlan,
  computeTargetsForPlan,
  getDeterministicWorkoutPlan,
} from './deterministicFallback';
import { parseStructuredPlan } from '../validation/parseStructuredPlan';
import { enrichAgentPlanV6, isV6Format } from './planOrchestrator_newFormat';
import { resolveMeals, resolveWorkouts, logOrchestrator } from './planOrchestratorResolve';
import { writeAILog } from '../aiOps';

const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
/** Tři pokusy o kompletní JSON (parseStructuredPlan valid) před meal_plan fallbackem. */
const OPENAI_RETRY_COUNT = 3;

function log(level, msg, data = {}) {
  logOrchestrator(level, msg, data);
}

/** Krátký důvod, proč parseStructuredPlan odmítl odpověď (pro logy na Vercelu). */
function diagnoseStructuredPlanRejection(parsed) {
  if (parsed == null || typeof parsed !== 'object') return 'root_not_object';
  if (Array.isArray(parsed.days) && parsed.days.length > 0) {
    return 'unexpected_invalid_with_non_empty_root_days';
  }
  if (!parsed.targets || typeof parsed.targets !== 'object') return 'missing_or_invalid_targets';
  const days = parsed.meal_plan?.days;
  if (!Array.isArray(days)) return 'meal_plan_days_missing_or_not_array';
  if (days.length < 7) return `meal_plan_days_length_${days.length}_need_7`;
  return 'unknown_rejection';
}

/** Zavolá OpenAI a vrátí parsovaný JSON. */
async function fetchStructuredPlanFromOpenAI(bodyMetrics) {
  const goal = bodyMetrics?.goal || 'udrzovani';
  const diet = bodyMetrics?.diet_type || 'standard';
  const meals = bodyMetrics?.meals_per_day ?? 3;
  const workouts = bodyMetrics?.workouts_per_week ?? 3;
  const equipment = Array.isArray(bodyMetrics?.equipment) ? bodyMetrics.equipment.join(', ') : 'bodyweight';
  const restrictions = [bodyMetrics?.allergies, bodyMetrics?.dietary_restrictions, bodyMetrics?.foods_to_avoid].filter(Boolean).join('; ');

  const totalMeals = meals * 7;
  const prompt = `Jsi nutriční a fitness poradce. Vytvoř strukturovaný týdenní plán jako JSON pro napojení na Spoonacular a wger.

VSTUP:
- Cíl: ${goal}
- Strava: ${diet}
- Jídel denně: ${meals}
- Tréninků týdně: ${workouts}
- Vybavení: ${equipment}
- Omezení: ${restrictions || 'žádná'}

OVĚŘENÉ Spoonacular dotazy — používej PŘESNĚ tyto řetězce (anglicky, max 3 slova; kratší je lepší). Nevymýšlej jiné dotazy.

SNÍDANĚ (breakfast): "scrambled eggs", "oatmeal banana", "greek yogurt granola", "avocado toast egg", "cottage cheese fruit", "overnight oats", "protein pancakes", "smoothie bowl", "fried eggs toast", "yogurt parfait"

OBĚD (lunch): "grilled chicken rice", "baked salmon", "beef stew", "lentil soup", "pasta chicken", "tuna pasta", "turkey burger", "pork chops", "shrimp rice", "quinoa chicken"

VEČEŘE (dinner): "tuna salad", "chicken salad", "greek salad", "caesar salad", "egg omelette", "salmon salad", "tofu stir fry", "cod fillet", "turkey salad", "chicken soup"

Svačina (snack): stejný styl jako snídaně — vyber jeden z řetězců ze sekce SNÍDANĚ výše (přesná kopie).

PRAVIDLA JÍDEL:
1. Za celý týden musí být přesně ${totalMeals} jídel (${meals} × 7 dní) a každé jídlo musí být JINÉ — unikátní kombinace (spoonacular_query + type + den). Žádné opakování stejného dotazu ve dvou polích.
2. spoonacular_query: výhradně jeden z řetězců výše podle type (breakfast/lunch/dinner/snack), přesný text v uvozovkách, anglicky, nejvýše 3 slova.
3. name_cs: česky, výstižně a popisně (např. "Ovesná kaše s banánem", ne jen "Ovesná kaše").
4. Sladit denní jídla s targets (kalorie, B/S/T) a s cílem uživatele (${goal}); při dietě/omezeních preferuj vhodné položky z tabulek.

STRUKTURA JSON:
- "targets": calories_per_day, protein_g, carbs_g, fat_g — reálné denní cíle podle cíle a profilu.
- "meal_plan": { "meals_per_day": ${meals}, "days": [ přesně 7 objektů, den 0–6 ] }
  Každý den: "day_name" (česky), "meals": přesně ${meals} položek.
  Každé jídlo: "type" (breakfast|lunch|dinner|snack), "name_cs", "spoonacular_query" (povinné; lze duplicitně vyplnit "search_query" stejně).

CVIKY — canonical_key POUZE z tohoto seznamu (přesný řetězec, podtržítka):
squat, pushup, plank, lunges, deadlift, bench_press, pull_up, bent_over_row, bicep_curl, tricep_extension, overhead_press, crunch, leg_raise, russian_twist, burpee, mountain_climber, jumping_jack, warmup, cooldown, rest

- "workout_plan":
  - "workout_days": day_index 0–6 (Neděle=0), počet = ${workouts} pokud workouts>0, jinak []
  - "days": pro každý workout_day objekt { "day_index", "exercises": [...] }
  Každý cvik: "name_cs", "search_term" (anglicky pro wger), "canonical_key" (povinně jedna z hodnot výše), "sets", "reps" nebo "duration_sec"

OBECNÁ PRAVIDLA:
1. Vrať POUZE validní JSON (response_format json_object).
2. Přesně ${workouts} tréninkových dnů s neprázdným "exercises", nebo 0 při workouts=0 — shoda s workout_days.
3. Cviky a objemy respektují vybavení: ${equipment}.
4. Nevymýšlej vlastní spoonacular_query ani vlastní canonical_key mimo výše uvedené seznamy.`;


  let lastFailureReason = null;
  let lastFailurePreview = null;

  for (let attempt = 1; attempt <= OPENAI_RETRY_COUNT; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Vrať pouze validní JSON bez markdown.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });
      const choice = completion.choices?.[0];
      const raw = choice?.message?.content;

      // Debug: útržek raw odpovědi OpenAI do ai_logs (neblokuje pipeline)
      await writeAILog({
        agent_slug: 'trainer',
        status: 'debug',
        message: raw ? String(raw).slice(0, 500) : 'NO_CONTENT_FROM_OPENAI',
        user_id: bodyMetrics?.user_id ?? null,
        payload: {
          stage: 'fetchStructuredPlanFromOpenAI',
          attempt,
          finish_reason: choice?.finish_reason ?? null,
          model: completion.model ?? null,
          completion_id: completion.id ?? null,
          refusal: choice?.message?.refusal ?? null,
        },
      });

      if (!raw) {
        lastFailureReason = 'empty_message_content';
        lastFailurePreview = null;
        console.log('[fetchStructuredPlanFromOpenAI] skip attempt: empty message content', {
          attempt,
          maxAttempts: OPENAI_RETRY_COUNT,
          finish_reason: choice?.finish_reason ?? null,
          refusal: choice?.message?.refusal ?? null,
          model: completion.model ?? null,
          id: completion.id ?? null,
        });
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (parseErr) {
        lastFailureReason = 'json_parse_failed';
        lastFailurePreview = String(raw).slice(0, 200);
        console.log('[fetchStructuredPlanFromOpenAI] skip attempt: JSON.parse failed', {
          attempt,
          message: parseErr?.message,
          rawHead: String(raw).slice(0, 240),
        });
        continue;
      }
      const { valid, plan } = parseStructuredPlan(parsed, bodyMetrics);
      if (valid && plan) return plan;
      const reason = diagnoseStructuredPlanRejection(parsed);
      lastFailureReason = reason;
      lastFailurePreview = typeof raw === 'string' ? raw.slice(0, 200) : null;
      console.log('[fetchStructuredPlanFromOpenAI] skip attempt: parseStructuredPlan invalid', {
        attempt,
        reason,
        topKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 20) : [],
        mealPlanDayCount: Array.isArray(parsed?.meal_plan?.days) ? parsed.meal_plan.days.length : null,
        rootDaysCount: Array.isArray(parsed?.days) ? parsed.days.length : null,
      });
    } catch (e) {
      lastFailureReason = e?.message || 'openai_request_error';
      lastFailurePreview = typeof e?.message === 'string' ? e.message.slice(0, 200) : null;
      console.log('[fetchStructuredPlanFromOpenAI] skip attempt: OpenAI request or pipeline error', {
        attempt,
        name: e?.name,
        message: e?.message,
        code: e?.code,
        status: e?.status,
        type: e?.type,
        stackHead: typeof e?.stack === 'string' ? e.stack.slice(0, 400) : null,
      });
      log('warn', `OpenAI attempt ${attempt} failed`, { message: e?.message });
    }
  }
  console.log('[trainer] OpenAI attempt failed:', {
    attempt: OPENAI_RETRY_COUNT,
    reason: lastFailureReason || 'all_attempts_exhausted',
    rawPreview: lastFailurePreview,
  });
  console.log('[fetchStructuredPlanFromOpenAI] return null: all attempts exhausted', {
    attempts: OPENAI_RETRY_COUNT,
    goal,
    diet,
    meals_per_day: meals,
    workouts_per_week: workouts,
  });
  return null;
}

/**
 * Hlavní orchestrátor.
 * @param {object} bodyMetrics - validovaný input
 * @param {{ useOpenAI?: boolean, requestId?: string, validFrom?: string, valid_from?: string, validUntil?: string, valid_until?: string }} [opts]
 * @returns {Promise<object>}
 */
export async function generateStructuredPlan(bodyMetrics, opts = {}) {
  console.log('[orchestrator] called', { useOpenAI: opts?.useOpenAI });
  console.log('[trainer] generateStructuredPlan start', {
    hasApiKey: !!process.env.OPENAI_API_KEY,
    goal: bodyMetrics?.goal,
  });

  const requestId = opts.requestId || `req_${Date.now()}`;
  const start = Date.now();
  const useOpenAI = opts.useOpenAI !== false;

  let structured = null;
  let generationSource = 'fallback';

  if (useOpenAI) {
    console.log('[trainer] calling OpenAI...');
    structured = await fetchStructuredPlanFromOpenAI(bodyMetrics);
    console.log('[trainer] OpenAI result:', {
      isNull: structured === null,
      source: structured?.generation_source,
    });
    if (structured) generationSource = 'openai';
  }

  if (!structured?.meal_plan) {
    log('warn', 'OpenAI nevrátil meal_plan — šablona jen z profilu (ne MEAL_QUERIES rotace)', { requestId });
    structured = structured || {};
    structured.targets = structured.targets || computeTargetsForPlan(bodyMetrics);
    structured.meal_plan = buildProfileTemplateMealPlan(bodyMetrics);
  }

  if (!structured?.workout_plan?.days?.length) {
    const workoutsPerWeek = bodyMetrics?.workouts_per_week ?? 3;
    structured = structured || {};
    if (workoutsPerWeek > 0) {
      const det = getDeterministicWorkoutPlan(bodyMetrics);
      structured.workout_plan = {
        workout_days: det.workout_days,
        days: det.days,
      };
      log('warn', 'Bez workout_plan z agenta — doplněny deterministické WORKOUT_BLOCKS', {
        requestId,
        workout_days: det.workout_days,
      });
    } else {
      structured.workout_plan = { workout_days: [], days: [] };
    }
  }

  if (isV6Format(structured)) {
    return enrichAgentPlanV6(structured, bodyMetrics, opts);
  }

  const workoutDays = structured.workout_plan?.workout_days ?? [];
  // Produční smlouva: vždy plný Spoonacular + wger resolve (žádný fastMode).
  // opts.fastMode se ignoruje – priorita je shoda s reálnými recepty a cviky.
  const fastMode = false;
  const [resolvedMeals, resolvedWorkouts] = await Promise.all([
    resolveMeals(structured.meal_plan, bodyMetrics?.diet_type, {
      fastMode,
      requestId,
      bodyMetrics,
      targets: structured?.targets ?? {},
      sourcePlanHtml: typeof structured.html === 'string' ? structured.html : '',
    }),
    resolveWorkouts(structured.workout_plan, { fastMode }),
  ]);

  const validFromOverride = opts.validFrom ?? opts.valid_from;
  const validUntilOverride = opts.validUntil ?? opts.valid_until;
  const validFrom = validFromOverride ? new Date(validFromOverride) : new Date();
  const validUntil = validUntilOverride ? new Date(validUntilOverride) : (() => {
    const u = new Date(validFrom);
    u.setDate(u.getDate() + 7);
    return u;
  })();

  const workoutByDayIndex = Object.fromEntries((resolvedWorkouts || []).map((w) => [w.day_index, w]));

  const startWeekday = validFrom.getDay();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(validFrom);
    d.setDate(d.getDate() + i);
    const dayIndex = d.getDay();
    const dayName = CZECH_DAYS[dayIndex];
    const mealDay = resolvedMeals[(startWeekday + i) % 7];
    const workout = workoutByDayIndex[dayIndex];

    days.push({
      date: d.toISOString().slice(0, 10),
      day_index: dayIndex,
      day_name: dayName,
      meals: mealDay?.meals ?? [],
      workout: workout
        ? {
            day_index: dayIndex,
            duration_minutes: bodyMetrics?.workout_duration_min ?? 45,
            exercises: workout.exercises,
          }
        : null,
    });
  }

  const mealsResolved = resolvedMeals.flatMap((x) => x.meals).filter((m) => m.recipe).length;
  const mealsFallback = resolvedMeals.flatMap((x) => x.meals).filter((m) => !m.recipe).length;
  const exercisesResolved = resolvedWorkouts.flatMap((w) => w.exercises).filter((e) => e.image_url || e.video_url).length;
  const exercisesFallback = resolvedWorkouts.flatMap((w) => w.exercises).filter((e) => !e.image_url && !e.video_url).length;

  const spoonacularDiag = resolvedMeals?._diag;
  const flatMealsForMedia = days.flatMap((d) => d.meals ?? []);
  const mealsVerifiedCount = flatMealsForMedia.filter((m) => m.recipe_verified === true).length;
  const mealsExactImageCount = flatMealsForMedia.filter(
    (m) => m.recipe_verified === true && m.image_trust_level === 'exact' && m.image_url
  ).length;
  const mealsWithShoppingLines = flatMealsForMedia.filter(
    (m) => m.recipe_verified === true && Array.isArray(m.shopping_ingredient_lines) && m.shopping_ingredient_lines.length > 0
  ).length;
  const shoppingDeduped = aggregateShoppingIngredientLinesFromStructuredPlan({ days });

  log('info', 'Plan generated', {
    requestId,
    duration_ms: Date.now() - start,
    generationSource,
    mealsResolved,
    mealsFallback,
    exercisesResolved,
    exercisesFallback,
    meals_verified_count: mealsVerifiedCount,
    meals_with_exact_spoonacular_image: mealsExactImageCount,
    meals_with_shopping_ingredient_lines: mealsWithShoppingLines,
    shopping_list_items_spoonacular_deduped: shoppingDeduped.length,
    meal_cards_placeholder_image: flatMealsForMedia.filter((m) => !(m.image_trust_level === 'exact' && m.image_url)).length,
    ...(spoonacularDiag ? {
      spoonacular_requests: spoonacularDiag.spoonacular_requests_total,
      meals_resolved_primary: spoonacularDiag.meals_resolved_primary,
      meals_resolved_fallback: spoonacularDiag.meals_resolved_fallback,
      meals_unverified: spoonacularDiag.meals_unverified,
      avg_confidence: spoonacularDiag.average_confidence_score,
      unverified_meal_searches: spoonacularDiag.unverified_meal_searches,
    } : {}),
  });

  return {
    ok: true,
    valid_from: validFrom.toISOString().slice(0, 10),
    valid_until: validUntil.toISOString().slice(0, 10),
    targets: structured?.targets ?? { calories_per_day: 2000, protein_g: 120, carbs_g: 220, fat_g: 65 },
    workouts_per_week: workoutDays.length,
    workout_days: workoutDays,
    days,
    ...(typeof structured?.html === 'string' && structured.html.trim()
      ? { html: structured.html.trim() }
      : {}),
    _diagnostics: {
      generation_source: generationSource,
      meals_resolved: mealsResolved,
      meals_fallback: mealsFallback,
      exercises_resolved: exercisesResolved,
      exercises_fallback: exercisesFallback,
      spoonacular_requests_total: resolvedMeals?._diag?.spoonacular_requests_total ?? null,
      spoonacular_requests_per_plan: resolvedMeals?._diag?.spoonacular_requests_per_plan ?? null,
      spoonacular_requests_per_meal: resolvedMeals?._diag?.spoonacular_requests_per_meal ?? null,
      meals_resolved_primary: resolvedMeals?._diag?.meals_resolved_primary ?? null,
      meals_resolved_fallback: resolvedMeals?._diag?.meals_resolved_fallback ?? null,
      meals_unverified: resolvedMeals?._diag?.meals_unverified ?? null,
      average_confidence_score: resolvedMeals?._diag?.average_confidence_score ?? null,
      cache_hit_rate: resolvedMeals?._diag?.cache_hit_rate ?? null,
      cache_miss_rate: resolvedMeals?._diag?.cache_miss_rate ?? null,
      unverified_meal_searches: resolvedMeals?._diag?.unverified_meal_searches ?? null,
      meals_recipe_verified_count: mealsVerifiedCount,
      meals_with_exact_spoonacular_image: mealsExactImageCount,
      meals_with_shopping_ingredient_lines: mealsWithShoppingLines,
      shopping_list_items_spoonacular_deduped: shoppingDeduped.length,
      meal_cards_placeholder_image: flatMealsForMedia.filter((m) => !(m.image_trust_level === 'exact' && m.image_url)).length,
    },
  };
}
