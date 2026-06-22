/**
 * lib/services/planOrchestrator.js
 * Orchestrace: OpenAI → Spoonacular → wger → finální plán.
 * Větev v6: planOrchestrator_newFormat (isV6Format + enrichAgentPlanV6).
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md
 */
import { openai } from '../openai';
import { aggregateShoppingIngredientLinesFromStructuredPlan } from '../spoonacularShopping';
import {
  buildCatalogSkeletonPlan,
  computeTargetsForPlan,
  getDeterministicWorkoutPlan,
} from './deterministicFallback';
import { buildSimpleStartMealSkeleton } from './simpleMealPlannerAgent.js';
import { resolveSyncOpenAiForPipeline } from '../openaiPlanConfig';
import { parseStructuredPlan } from '../validation/parseStructuredPlan';
import { isSpoonacularRegistrationCompressEnabled } from '../spoonacularQuotaGate';
import { enrichAgentPlanV6, isV6Format } from './planOrchestrator_newFormat';
import { resolveMeals, resolveWorkouts, logOrchestrator } from './planOrchestratorResolve';
import { loadResolvedWorkoutsFromLatestPlan } from './priorPlanWorkouts';
import { writeAILog } from '../aiOps';
import { bodyMetricsToPlanInput } from '../bodyMetricsToPlanInput';
import { addCalendarDaysIsoPrague, calendarDateIsoInPrague, weekdayIndexJsFromPragueIso } from '../czechCalendar';
import { buildPlanPromptProfileJson } from '../compactPlanPrompt';
import {
  PLAN_DELIVERY_QUALITY_BLOCK,
  highCalorieMealPolicyBlock,
} from '../recipeSimplicityScore.js';
import {
  BM_ON_CORE_AI_PRINCIPLES,
  BM_ON_SIMPLE_NUTRITION_RULES,
  BM_ON_TRAINING_RULES,
  BM_ON_OUTPUT_SAFETY_RULES,
  BM_ON_GPT_START_MEAL_GUARD,
} from '../aiInstructionBlocks.js';
import { sortMealsChronologically } from '../mealOrder';
import { safeLog } from '../safeLog';
import { getOpenAiPlanModel } from '../openaiModels';
import { enforceWorkoutsPerWeekInPlan, scaleAndDiversifyWorkoutPlan } from '../workoutPlanScaler';

const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

function readOpenAiPlanRetryCount() {
  const n = parseInt(String(process.env.OPENAI_PLAN_RETRY_COUNT || '1'), 10);
  if (Number.isFinite(n) && n >= 1 && n <= 3) return n;
  return 1;
}

function readOpenAiPlanMaxTokens() {
  const n = parseInt(String(process.env.OPENAI_PLAN_MAX_TOKENS || '4096'), 10);
  if (Number.isFinite(n) && n >= 2000 && n <= 16000) return n;
  return 4096;
}

/** Tři pokusy o kompletní JSON (parseStructuredPlan valid) před meal_plan fallbackem; druhý+ s krátkým repair promptem. */
const OPENAI_RETRY_COUNT = readOpenAiPlanRetryCount();
const OPENAI_PLAN_MAX_TOKENS = readOpenAiPlanMaxTokens();

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

function buildRepairStructuredPlanUserMessage(
  bodyMetrics,
  planInput,
  workoutPlanCardinalityRule,
  lastRaw,
  failureReason
) {
  const meals = planInput.meals_per_day;
  const workouts = planInput.workouts_per_week;
  const slice = String(lastRaw || '').slice(0, 6000);
  const profileHint = buildPlanPromptProfileJson(bodyMetrics).slice(0, 720);
  return `Oprav JSON plánu. Validace: ${failureReason}.
Kontext profilu: ${profileHint}

STRUKTURA:
- targets, meal_plan.days (přesně 7 položek; nepoužívej daily_plan/week_plan místo meal_plan), workout_plan: ${workoutPlanCardinalityRule}

Neplatný výstup (jeden opravený JSON):
${slice}`;
}

/**
 * // FIX (a4e44f9+): explicitní kalorický pás + porce — produkce vracela ~30–50 % cíle po Spoonacular.
 * @param {number} targetKcal
 */
function planPromptCriticalCaloriesBlock(targetKcal) {
  const t = Math.round(Number(targetKcal) || 2200);
  const lo = Math.round(t * 0.85);
  const hi = Math.round(t * 1.1);
  return `KRITICKÉ KALORICKÉ POŽADAVKY (po navázání na katalog musí den držet součet kcal z receptů v tomto pásmu):
- Cíl: ${t} kcal/den (calories_per_day v targets).
- KAŽDÝ den: součet kalorií ze všech jídel (reálné porce dospělého) v rozmezí ${lo}–${hi} kcal.
- Pokud by součet vypadal nízko: přidej type \"snack\" (200–500 kcal) nebo zvol větší porce jednoduchých jídel (více rýže/brambor/těstovin, větší tvaroh/jogurt).
- Orientační rozložení při 3 hlavních jídlech: snídaně ~500–700 kcal, oběd ~700–900 kcal, večeře ~600–800 kcal (+ svačiny dle potřeby).
- Vyhni se: jediný smoothie jako snídaně; salát bez proteinu jako jediná večeře.
${highCalorieMealPolicyBlock(t)}`;
}

/** Kratší prompt bez tabulek příkladů — druhý pokus při truncated JSON bez days[]. */
function buildCompactStructuredPlanPrompt(
  bodyMetrics,
  planInput,
  workoutPlanCardinalityRule,
  workoutIndicesParagraph,
  profileJson,
  meals,
  workouts,
  totalMeals,
  targetKcal
) {
  const t = Math.round(Number(targetKcal) || 2200);
  return `Jsi nutriční a fitness poradce. Vrať POUZE validní JSON (json_object) pro týdenní plán.

PROFIL_JSON:
${profileJson}

Kalendář: day_index 0=Neděle … 6=Sobota. Tréninků týdně: ${workouts}.
${workoutIndicesParagraph ? `${workoutIndicesParagraph}\n` : ''}
${workoutPlanCardinalityRule}

${planPromptCriticalCaloriesBlock(t)}

${BM_ON_CORE_AI_PRINCIPLES}

${BM_ON_SIMPLE_NUTRITION_RULES}

${BM_ON_TRAINING_RULES}

${BM_ON_OUTPUT_SAFETY_RULES}

${PLAN_DELIVERY_QUALITY_BLOCK}

FORMÁT (POVINNÉ — žádné aliasy místo meal_plan):
- Klíč se 7 dny jídel MUSÍ být \"meal_plan\".\"days\" (pole přesně 7 objektů). Nepoužívej daily_plan, week_plan ani schedule místo toho.
- Volitelně můžeš doplnit kořenové \"days\" se stejným obsahem; nesmí být prázdné, pokud meal_plan.days obsahuje data.

Povinná struktura:
- "targets": { "calories_per_day", "protein_g", "carbs_g", "fat_g" }
- "meal_plan": { "meals_per_day": ${meals}, "days": [ přesně 7 objektů day_index 0–6 ] }
  Každý den: "day_name" (česky), "meals": přesně ${meals} položek.
  Každé jídlo: "type" (breakfast|lunch|dinner|snack), "name_cs", "spoonacular_query" (anglicky, max 3 slova).
  Doporučeno: "target_kcal" (+ volitelně protein_min, carbs_min) pro každý slot — součet target_kcal za den ≈ calories_per_day.
- "workout_plan": { "workout_days": [], "days": [ { "day_index", "exercises": [...] } ] }
  Cvik: "name_cs", "search_term", "canonical_key" (squat, pushup, plank, lunges, deadlift, bench_press, pull_up, bent_over_row, bicep_curl, tricep_extension, overhead_press, crunch, leg_raise, russian_twist, burpee, mountain_climber, jumping_jack, warmup, cooldown, rest), "sets", "reps" nebo "duration_sec".

Pravidla:
1. Jídla se mohou opakovat — preferuj jednoduchá běžná jídla před pestrostí.
2. Respektuj cíl, diet_type, equipment a foods_to_avoid z PROFIL_JSON.
3. Nevracej prázdné meal_plan.days.
4. name_cs: krátký běžný název (např. „Kuře s rýží“, „Tvaroh s banánem“), ne food-blog titulky.

${typeof bodyMetrics?._plan_prompt_extra === 'string' && bodyMetrics._plan_prompt_extra.trim()
    ? `DODATEČNÉ PŘÍSNÉ PRAVIDLO:\n${bodyMetrics._plan_prompt_extra.trim()}\n`
    : ''}`;
}

function shouldScheduleCompactPlanRetry(parsed, reason) {
  const rootDays = Array.isArray(parsed?.days) ? parsed.days.length : 0;
  const mealPlanDays = Array.isArray(parsed?.meal_plan?.days) ? parsed.meal_plan.days.length : 0;
  if (rootDays === 0 && mealPlanDays < 7) return true;
  if (typeof reason === 'string' && reason.startsWith('meal_plan_days')) return mealPlanDays < 7;
  if (reason === 'missing_or_invalid_targets' && mealPlanDays < 7) return true;
  return false;
}

/** Zavolá OpenAI a vrátí parsovaný JSON. */
async function fetchStructuredPlanFromOpenAI(bodyMetrics) {
  const planModel = getOpenAiPlanModel();
  const fetchT0 = Date.now();
  const planInput = bodyMetricsToPlanInput(bodyMetrics);
  const computedTargets = computeTargetsForPlan(bodyMetrics);
  const targetKcalForPrompt = Math.round(Number(computedTargets.calories_per_day) || 2200);
  const goal = bodyMetrics?.goal || 'udrzovani';
  const diet = bodyMetrics?.diet_type || 'standard';
  const meals = planInput.meals_per_day;
  const workouts = planInput.workouts_per_week;

  const workoutDaysLine =
    bodyMetrics?.workout_days != null && String(bodyMetrics.workout_days).trim() !== ''
      ? String(bodyMetrics.workout_days).trim()
      : 'flexibilní';

  const profileJson = buildPlanPromptProfileJson(bodyMetrics);
  const totalMeals = meals * 7;
  const preferredWorkoutDays = planInput.preferred_workout_days;
  const hasFlexibleWorkoutDays =
    !bodyMetrics?.workout_days ||
    !String(bodyMetrics.workout_days).trim() ||
    String(workoutDaysLine).toLowerCase().includes('flexibil');
  const prefDaysFiltered = Array.isArray(preferredWorkoutDays)
    ? preferredWorkoutDays.filter((n) => typeof n === 'number' && n >= 0 && n <= 6)
    : [];
  const workoutIndicesParagraph =
    workouts === 0
      ? ''
      : prefDaysFiltered.length >= workouts
        ? `TRÉNINK — Rozvržení: reálný trénink POUZE ve dnech day_index ${prefDaysFiltered.slice(0, workouts).join(', ')} (0=Neděle … 6=Sobota). Ostatní dny = pouze rest.`
        : workouts === 3 && hasFlexibleWorkoutDays
          ? 'TRÉNINK — Rozvržení (3× týdně, bez vybraných dnů): trénink MUSÍ být v pondělí (day_index 1), středa (day_index 3), pátek (day_index 5). V JSON platí 0=Neděle, 1=Pondělí, 2=Úterý, 3=Středa, 4=Čtvrtek, 5=Pátek, 6=Sobota (pondělí NENÍ 0). Ostatní dny = pouze canonical_key "rest".'
          : `TRÉNINK — Rozlož ${workouts} tréninkových dnů s rozumným odstupem (day_index 0–6; 0=Neděle). Ostatní dny = pouze rest.`;

  const workoutPlanCardinalityRule =
    workouts === 0
      ? 'workout_plan: na všech 7 kalendářních dnech pouze odpočinek — každý den exercises obsahují jen cvik s canonical_key: "rest" (žádný jiný reálný trénink).'
      : `workout_plan musí mít PŘESNĚ ${workouts} tréninkových dnů s reálným cvičením (den počítá jen pokud má aspoň jeden cvik s canonical_key jiným než "rest"); ostatní dny z týdne mají výhradně canonical_key: "rest".`;

  const prompt = `Jsi nutriční a fitness poradce. Vytvoř strukturovaný týdenní plán jako JSON pro Spoonacular (jídla) a wger (cviky).
Vždy vyplň meal_plan (7 dní) i workout_plan podle workouts_per_week v PROFIL_JSON — e-mail/UI mohou skrývat trénink, data musí být kompletní.

PROFIL_JSON (zdroj pravdy o uživateli, bez identifikátorů):
${profileJson}

KALENDÁŘ: day_index 0=Neděle … 6=Sobota (pondělí=1). 3× týdně bez vybraných dnů ⇒ dny 1, 3, 5.
WGER: Počet dnů s cvičením = workouts_per_week z PROFIL_JSON (nebo weekly_sessions_label pokud je číslo); ostatní dny pouze canonical_key "rest".
${workoutIndicesParagraph ? `${workoutIndicesParagraph}\n` : ''}
Tréninků týdně v plánu (odvozeno): ${workouts}. Přesná kardinalita viz PRAVIDLA níže.

${planPromptCriticalCaloriesBlock(targetKcalForPrompt)}

${BM_ON_CORE_AI_PRINCIPLES}

${BM_ON_SIMPLE_NUTRITION_RULES}

${BM_ON_TRAINING_RULES}

${BM_ON_OUTPUT_SAFETY_RULES}

${PLAN_DELIVERY_QUALITY_BLOCK}

OVĚŘENÉ Spoonacular dotazy — používej PŘESNĚ tyto řetězce (anglicky, max 3 slova; kratší je lepší). Nevymýšlej jiné dotazy.

SNÍDANĚ (breakfast): "scrambled eggs", "oatmeal banana", "greek yogurt", "cottage cheese", "fried eggs toast", "yogurt fruit", "overnight oats", "protein shake"

OBĚD (lunch): "grilled chicken rice", "chicken rice", "turkey potato", "pasta tuna", "chicken pasta", "beef potato", "rice eggs", "lentil rice", "beans rice"

VEČEŘE (dinner): "tuna salad", "chicken salad", "egg omelette", "chicken vegetables", "cottage cheese", "pasta chicken", "potato eggs", "turkey salad"

Svačina (snack): "greek yogurt", "cottage cheese", "yogurt fruit", "protein shake", "ham sandwich", "boiled eggs", "banana milk"

PRAVIDLA JÍDEL:
1. Jídla se MOHOU opakovat — stejné jednoduché jídlo 2–3× týdně je v pořádku. Jednoduchost > originalita.
2. spoonacular_query: výhradně jeden z řetězců výše podle type (breakfast/lunch/dinner/snack), anglicky, max 3 slova.
3. name_cs: krátký běžný český název (např. „Kuře s rýží a zeleninou“, „Tvaroh s banánem“, „Vejce s pečivem“). Žádné fine dining, frittata, lasagne, mexická mísa, pesto, salsa.
4. Sladit denní jídla s targets (kalorie, B/S/T); vysoké kalorie = větší porce jednoduchých jídel, ne složitější recepty.
5. Pokud PROFIL_JSON obsahuje coach_memory_summary, zohledni ho — nikdy neporuš alergie, foods_to_avoid, diet_type ani targets.

STRUKTURA JSON (povinné klíče — žádné aliasy místo meal_plan):
- "targets": calories_per_day, protein_g, carbs_g, fat_g — konzistentní s ${targetKcalForPrompt} kcal/den a profilem.
- "meal_plan": { "meals_per_day": ${meals}, "days": [ přesně 7 objektů, den 0–6 ] } — POVINNÝ klíč \"days\" uvnitř meal_plan. Nepoužívej daily_plan / week_plan / schedule.
  Každý den: "day_name" (česky), "meals": přesně ${meals} položek.
  Každé jídlo: "type" (breakfast|lunch|dinner|snack), "name_cs", "spoonacular_query" (povinné; lze duplicitně vyplnit "search_query" stejně).
  Doporučené pro správné porce ve Spoonacular (vyplň u každého jídla): "target_kcal" (integer, cíl kcal jedné porce z API), volitelně "protein_min", "carbs_min" (g). Součet target_kcal přes všechna jídla v jednom dni má být blízko calories_per_day (±12 %).
  Příklad SK (2100 kcal/den, 3 jídla): snídaně „Tvaroh s banánem“ (~550 kcal), oběd „Kuře s rýží a zeleninou“ (~750 kcal), večeře „Tuňákový salát s pečivem“ (~620 kcal).

CVIKY — canonical_key POUZE z tohoto seznamu (přesný řetězec, podtržítka):
squat, pushup, plank, lunges, deadlift, bench_press, pull_up, bent_over_row, bicep_curl, tricep_extension, overhead_press, crunch, leg_raise, russian_twist, burpee, mountain_climber, jumping_jack, warmup, cooldown, rest

- "workout_plan":
  - "workout_days": pole day_index 0–6 jen pro dny s reálným tréninkem; při workouts=0 prázdné pole []
  - "days": objekty { "day_index", "exercises" } pro každý den, kde je trénink; ostatní dny v týdnu vynech nebo vyplň jen rest — ale ${workoutPlanCardinalityRule}
  Každý cvik: "name_cs", "search_term" (anglicky pro wger), "canonical_key" (povinně jedna z hodnot výše), "sets", "reps" nebo "duration_sec"

OBECNÁ PRAVIDLA:
1. Vrať POUZE validní JSON (response_format json_object).
2. Cviky a objemy respektují vybavení z PROFIL_JSON (equipment).
3. Nevymýšlej vlastní spoonacular_query ani vlastní canonical_key mimo výše uvedené seznamy.
4. Denní kalorie: pro KAŽDÝ den musí být součet kalorií ze všech naplánovaných jídel (odhad podle typu a spoonacular_query) blízko calories_per_day — cíl ±15 %. Při 3 jídlech denně a vysokém cíli (např. 2200 kcal) musí být aspoň jedno jídlo vydatnější nebo přidej snack (type snack), jinak by součet klesl až k ~800–1000 kcal (nepřijatelné).
5. name_cs musí odpovídat zvolenému spoonacular_query (např. query „scrambled eggs“ ⇒ název s vejci, ne „tofu“; query s tuňákem ⇒ tuňák, ne kuře).

${typeof bodyMetrics?._plan_prompt_extra === 'string' && bodyMetrics._plan_prompt_extra.trim()
    ? `DODATEČNÉ PŘÍSNÉ PRAVIDLO:\n${bodyMetrics._plan_prompt_extra.trim()}\n`
    : ''}`;


  let lastFailureReason = null;
  let lastFailurePreview = null;
  let lastRawForRepair = null;
  let compactRetryScheduled = false;

  for (let attempt = 1; attempt <= OPENAI_RETRY_COUNT; attempt++) {
    try {
      let userContent = prompt;
      if (attempt > 1 && compactRetryScheduled && !lastRawForRepair) {
        userContent = buildCompactStructuredPlanPrompt(
          bodyMetrics,
          planInput,
          workoutPlanCardinalityRule,
          workoutIndicesParagraph,
          profileJson,
          meals,
          workouts,
          totalMeals,
          targetKcalForPrompt
        );
        compactRetryScheduled = false;
      } else if (attempt > 1 && lastRawForRepair) {
        userContent = buildRepairStructuredPlanUserMessage(
          bodyMetrics,
          planInput,
          workoutPlanCardinalityRule,
          lastRawForRepair,
          lastFailureReason || 'validation_failed'
        );
      }
      const openaiResponse = await openai.chat.completions.create({
        model: planModel,
        messages: [
          { role: 'system', content: 'Vrať pouze validní JSON bez markdown.' },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: OPENAI_PLAN_MAX_TOKENS,
      });
      console.log('[DEBUG-OPENAI]', JSON.stringify(openaiResponse?.choices?.[0]?.message?.content).slice(0, 300));
      const completion = openaiResponse;
      const choice = completion.choices?.[0];
      const raw = choice?.message?.content;
      const usage = completion.usage || {};
      const promptTokens = usage.prompt_tokens ?? null;
      const completionTokens = usage.completion_tokens ?? null;

      const memSummary = bodyMetrics?._coach_memory_summary;
      const memMeta = bodyMetrics?._coach_memory_meta;
      safeLog('plan_openai_attempt', {
        stage: 'fetchStructuredPlanFromOpenAI',
        attempt,
        maxAttempts: OPENAI_RETRY_COUNT,
        model: planModel,
        finishReason: choice?.finish_reason ?? null,
        promptTokens,
        completionTokens,
        promptChars: typeof userContent === 'string' ? userContent.length : null,
        outputChars: typeof raw === 'string' ? raw.length : null,
        memoryItemsUsed: typeof memMeta?.itemsUsed === 'number' ? memMeta.itemsUsed : null,
        memoryContextChars: typeof memSummary === 'string' ? memSummary.length : 0,
        memoryTruncated: memMeta?.truncated === true,
      });

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
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
        },
      });

      if (!raw) {
        lastFailureReason = 'empty_message_content';
        lastFailurePreview = null;
        lastRawForRepair = null;
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
      let rawParsed;
      try {
        parsed = JSON.parse(raw);
        rawParsed = parsed;
      } catch (parseErr) {
        lastFailureReason = 'json_parse_failed';
        lastFailurePreview = String(raw).slice(0, 200);
        lastRawForRepair = raw;
        console.log('[fetchStructuredPlanFromOpenAI] skip attempt: JSON.parse failed', {
          attempt,
          message: parseErr?.message,
          rawHead: String(raw).slice(0, 240),
        });
        continue;
      }
      console.log('[DEBUG-PLAN]', JSON.stringify(rawParsed).slice(0, 500));
      const { valid, plan } = parseStructuredPlan(parsed, bodyMetrics);
      if (valid && plan) {
        safeLog('plan_openai_structured_ok', {
          attempt,
          model: planModel,
          durationMs: Date.now() - fetchT0,
          finishReason: choice?.finish_reason ?? null,
          promptTokens,
          completionTokens,
          memoryItemsUsed: typeof memMeta?.itemsUsed === 'number' ? memMeta.itemsUsed : null,
          memoryContextChars: typeof memSummary === 'string' ? memSummary.length : 0,
          memoryTruncated: memMeta?.truncated === true,
        });
        return plan;
      }
      const reason = diagnoseStructuredPlanRejection(parsed);
      lastFailureReason = reason;
      lastFailurePreview = typeof raw === 'string' ? raw.slice(0, 200) : null;
      lastRawForRepair = raw;
      if (shouldScheduleCompactPlanRetry(parsed, reason)) {
        compactRetryScheduled = true;
      }
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
  safeLog('plan_openai_exhausted', {
    attempts: OPENAI_RETRY_COUNT,
    model: planModel,
    durationMs: Date.now() - fetchT0,
    lastFailureReason: lastFailureReason || 'all_attempts_exhausted',
  });
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
 * @param {{ useOpenAI?: boolean, requestId?: string, validFrom?: string, valid_from?: string, validUntil?: string, valid_until?: string, mealsOnly?: boolean, allowLiveSpoonacular?: boolean }} [opts] – `allowLiveSpoonacular` true jen u úkolu initial_plan (registrace)
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
  const useOpenAI = resolveSyncOpenAiForPipeline(opts.useOpenAI === true);

  let structured = null;
  let generationSource = 'catalog';

  if (useOpenAI) {
    console.log('[trainer] calling OpenAI (sync skeleton, OPENAI_PLAN_ENABLED)...');
    let bmForOpenAI = bodyMetrics;
    if (opts.simpleStartMode === true) {
      bmForOpenAI = {
        ...bodyMetrics,
        _plan_prompt_extra: bodyMetrics._plan_prompt_extra
          ? `${BM_ON_GPT_START_MEAL_GUARD}\n${bodyMetrics._plan_prompt_extra}`
          : BM_ON_GPT_START_MEAL_GUARD,
      };
    }
    structured = await fetchStructuredPlanFromOpenAI(bmForOpenAI);
    console.log('[trainer] OpenAI result:', {
      isNull: structured === null,
      source: structured?.generation_source,
    });
    if (structured) generationSource = 'openai';
  }

  if (opts.simpleStartMode === true) {
    log('info', 'SimpleMealPlannerAgent skeleton (START initial plan)', { requestId });
    const agentSkeleton = buildSimpleStartMealSkeleton({
      bodyMetrics,
      targets: structured?.targets || computeTargetsForPlan(bodyMetrics),
    });
    structured = structured || {};
    structured.targets = agentSkeleton.targets || computeTargetsForPlan(bodyMetrics);
    structured.meal_plan = agentSkeleton.meal_plan;
    generationSource = 'simple_meal_planner_agent';
  } else if (!structured?.meal_plan) {
    log('info', 'Katalogový skeleton (bez GPT meal_plan)', { requestId, useOpenAI });
    const catalogSkeleton = buildCatalogSkeletonPlan(bodyMetrics);
    structured = structured || {};
    structured.targets = catalogSkeleton.targets || computeTargetsForPlan(bodyMetrics);
    structured.meal_plan = catalogSkeleton.meal_plan;
    if (!useOpenAI || !structured) generationSource = 'catalog';
  }

  // Jeden zdroj pravdy pro kalorický cíl: registrace (body_metrics.calories_target).
  // AI smí navrhnout makra, ale calories_per_day nesmí přebít cíl z registrace —
  // stejné číslo pak používá škálování porcí i uložené daily_calories.
  {
    const registrationCalories = Number(computeTargetsForPlan(bodyMetrics)?.calories_per_day);
    if (Number.isFinite(registrationCalories) && registrationCalories > 0) {
      structured.targets = structured.targets || {};
      if (Number(structured.targets.calories_per_day) !== registrationCalories) {
        log('info', 'targets.calories_per_day sjednoceno s cílem z registrace', {
          requestId,
          ai_calories_per_day: structured.targets.calories_per_day ?? null,
          registration_calories_target: registrationCalories,
        });
        structured.targets.calories_per_day = registrationCalories;
      }
    }
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
  const mealsOnly = opts.mealsOnly === true;
  const validFromOverride = opts.validFrom ?? opts.valid_from;
  const validUntilOverride = opts.validUntil ?? opts.valid_until;
  const validFromIso =
    validFromOverride != null && String(validFromOverride).trim()
      ? String(validFromOverride).replace(/T.*/, '').slice(0, 10)
      : calendarDateIsoInPrague(new Date());
  const validUntilIso =
    validUntilOverride != null && String(validUntilOverride).trim()
      ? String(validUntilOverride).replace(/T.*/, '').slice(0, 10)
      : addCalendarDaysIsoPrague(validFromIso, 6);

  const spoonacularResolveOpts = {
    fastMode,
    requestId,
    bodyMetrics,
    targets: structured?.targets ?? {},
    sourcePlanHtml: typeof structured.html === 'string' ? structured.html : '',
    allowLiveSpoonacular: opts.allowLiveSpoonacular === true,
    compressSpoonacular:
      opts.compressSpoonacular === true ||
      (opts.allowLiveSpoonacular === true && isSpoonacularRegistrationCompressEnabled()),
    validFrom: validFromIso,
    simpleStartMode: opts.simpleStartMode === true,
    plan_scope: opts.plan_scope ?? null,
  };
  let resolvedMeals;
  let resolvedWorkouts;
  let workoutsResolveSource = 'wger';

  if (mealsOnly && bodyMetrics?.user_id) {
    const priorWorkouts = await loadResolvedWorkoutsFromLatestPlan(bodyMetrics.user_id);
    if (priorWorkouts?.length) {
      workoutsResolveSource = 'prior_plan';
      log('info', 'mealsOnly: přeskakuji wger resolve, cviky z posledního uloženého plánu', {
        requestId,
        userId: bodyMetrics.user_id,
        priorWorkoutDays: priorWorkouts.length,
      });
      resolvedWorkouts = priorWorkouts;
      resolvedMeals = await resolveMeals(structured.meal_plan, bodyMetrics?.diet_type, spoonacularResolveOpts);
    }
  }

  if (!resolvedMeals || !resolvedWorkouts) {
    workoutsResolveSource = 'wger';
    if (mealsOnly && bodyMetrics?.user_id) {
      log('warn', 'mealsOnly: nelze načíst cviky z předchozího plánu — plný wger resolve', { requestId });
    }
    enforceWorkoutsPerWeekInPlan(structured.workout_plan, bodyMetrics);
    scaleAndDiversifyWorkoutPlan(structured.workout_plan, bodyMetrics);
    const pair = await Promise.all([
      resolveMeals(structured.meal_plan, bodyMetrics?.diet_type, spoonacularResolveOpts),
      resolveWorkouts(structured.workout_plan, { fastMode }),
    ]);
    resolvedMeals = pair[0];
    resolvedWorkouts = pair[1];
  }

  const workoutByDayIndex = Object.fromEntries((resolvedWorkouts || []).map((w) => [w.day_index, w]));

  const mealByDayIndex = new Map();
  for (const block of resolvedMeals || []) {
    if (!block || typeof block !== 'object') continue;
    const di = Number(block.day_index);
    if (Number.isFinite(di) && di >= 0 && di <= 6) mealByDayIndex.set(di, block);
  }

  const days = [];
  for (let i = 0; i < 7; i++) {
    const dow = weekdayIndexJsFromPragueIso(validFromIso, i);
    const dayName = CZECH_DAYS[dow];
    const mealDay = mealByDayIndex.get(dow) ?? mealByDayIndex.get(i) ?? { meals: [] };
    const workout = workoutByDayIndex[dow];

    days.push({
      date: addCalendarDaysIsoPrague(validFromIso, i),
      day_index: dow,
      day_name: dayName,
      meals: sortMealsChronologically(mealDay?.meals ?? []),
      workout: workout
        ? {
            day_index: dow,
            duration_minutes: bodyMetrics?.workout_duration_min ?? 60,
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
    meals_only: mealsOnly,
    workouts_resolve_source: workoutsResolveSource,
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
    valid_from: validFromIso,
    valid_until: validUntilIso,
    targets: structured?.targets ?? { calories_per_day: 2000, protein_g: 120, carbs_g: 220, fat_g: 65 },
    workouts_per_week: workoutDays.length,
    workout_days: workoutDays,
    days,
    ...(typeof structured?.html === 'string' && structured.html.trim()
      ? { html: structured.html.trim() }
      : {}),
    _diagnostics: {
      generation_source: generationSource,
      meals_only: mealsOnly,
      workouts_resolve_source: workoutsResolveSource,
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
