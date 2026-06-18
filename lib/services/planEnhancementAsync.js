/**
 * Volitelný async OpenAI enhancement — pouze texty (planner_suggestion_cs, coach tipy).
 * Nemění catalog_id, kalorie, makra ani porce.
 */
import { openai } from '../openai';
import { getOpenAiPlanModel } from '../openaiModels';
import { shouldRunAsyncPlanEnhancement } from '../openaiPlanConfig';
import { supabaseServer } from '../supabaseServer';
import { renderPlanHtmlFromStructured } from '../planRenderer';
import { stripPlanMediaAttrsFromHtml } from '../emailTemplates';
import { buildPlanPromptProfileJson } from '../compactPlanPrompt';
import { safeLog } from '../safeLog';

const ENHANCEMENT_TIMEOUT_MS = 18000;

/**
 * @param {object} planJson
 * @returns {object}
 */
function snapshotMealsForPrompt(planJson) {
  const days = planJson?.days ?? [];
  return days.map((d, di) => ({
    day_index: d.day_index ?? di,
    day_name: d.day_name ?? `den ${di + 1}`,
    meals: (d.meals ?? []).map((m, mi) => ({
      slot: mi,
      type: m.type,
      catalog_name_cs: m.display_name_cs || m.name_cs || '',
      kcal: m.kcal,
    })),
  }));
}

/**
 * @param {object} bodyMetrics
 * @param {object} planJson
 * @returns {string}
 */
function buildEnhancementPrompt(bodyMetrics, planJson) {
  const profile = buildPlanPromptProfileJson(bodyMetrics);
  const days = snapshotMealsForPrompt(planJson);
  return `Jsi kouč. Uživatel už má hotový týdenní jídelníček z katalogu (recepty a kalorie jsou FINÁLNÍ).

PROFIL:
${profile}

JÍDELNÍČEK (jen pro kontext — neměň kalorie ani názvy receptů z katalogu):
${JSON.stringify(days)}

Vrať JSON:
{
  "days": [
    {
      "day_index": 0,
      "coach_day_tip": "krátký tip na den (1 věta, česky)",
      "meals": [
        { "slot": 0, "planner_suggestion_cs": "přátelský návrh / varianta názvu (česky)" }
      ]
    }
  ]
}

Pravidla:
- planner_suggestion_cs: max 80 znaků, inspirace k jídlu, NE nový recept.
- coach_day_tip: max 120 znaků.
- Přesně 7 dní, slot odpovídá pořadí jídel v JSON vstupu.
- Respektuj coach_memory_summary a foods_to_avoid z profilu.`;
}

/**
 * @param {object} planJson
 * @param {object} enhancement
 * @returns {object}
 */
export function applyEnhancementToPlanJson(planJson, enhancement) {
  if (!planJson || !enhancement?.days) return planJson;
  const out = JSON.parse(JSON.stringify(planJson));
  const enhByDay = new Map(
    (enhancement.days || []).map((d) => [Number(d.day_index), d])
  );
  for (let di = 0; di < (out.days || []).length; di++) {
    const day = out.days[di];
    const dayIdx = Number(day.day_index ?? di);
    const enhDay = enhByDay.get(dayIdx);
    if (!enhDay) continue;
    if (typeof enhDay.coach_day_tip === 'string' && enhDay.coach_day_tip.trim()) {
      day.coach_day_tip = enhDay.coach_day_tip.trim().slice(0, 120);
    }
    const mealsEnh = Array.isArray(enhDay.meals) ? enhDay.meals : [];
    for (let mi = 0; mi < (day.meals || []).length; mi++) {
      const meal = day.meals[mi];
      const slotEnh = mealsEnh.find((m) => Number(m.slot) === mi) || mealsEnh[mi];
      const sug = slotEnh?.planner_suggestion_cs;
      if (typeof sug === 'string' && sug.trim()) {
        meal.planner_suggestion_cs = sug.trim().slice(0, 80);
      }
    }
  }
  out._diagnostics = {
    ...(out._diagnostics || {}),
    enhancement_source: 'openai_async',
    enhanced_at: new Date().toISOString(),
  };
  return out;
}

/**
 * @param {object} bodyMetrics
 * @param {object} planJson
 * @returns {Promise<object|null>}
 */
async function fetchPlanEnhancementFromOpenAI(bodyMetrics, planJson) {
  const model = getOpenAiPlanModel();
  const prompt = buildEnhancementPrompt(bodyMetrics, planJson);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENHANCEMENT_TIMEOUT_MS);
  try {
    const completion = await openai.chat.completions.create(
      {
        model,
        messages: [
          {
            role: 'system',
            content: 'Vrať pouze validní JSON. Nesmíš měnit kalorie, catalog_id, recepty ani trénink.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 1800,
      },
      { signal: controller.signal }
    );
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    const status = e?.status ?? e?.response?.status;
    safeLog('plan_enhancement_failed', {
      userId: bodyMetrics?.user_id ?? null,
      status: status ?? null,
      message: String(e?.message || e).slice(0, 200),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ planId: string, userId?: string, bodyMetrics: object, planJson: object }} params
 */
export async function runPlanEnhancementAsync(params) {
  const { planId, bodyMetrics, planJson } = params;
  if (!planId || !planJson?.days?.length) return { ok: false, reason: 'missing_plan' };
  if (!shouldRunAsyncPlanEnhancement(bodyMetrics)) {
    return { ok: false, reason: 'enhancement_disabled' };
  }

  const enhancement = await fetchPlanEnhancementFromOpenAI(bodyMetrics, planJson);
  if (!enhancement) return { ok: false, reason: 'openai_failed' };

  const patched = applyEnhancementToPlanJson(planJson, enhancement);
  const planHtml = stripPlanMediaAttrsFromHtml(renderPlanHtmlFromStructured(patched, bodyMetrics));

  const { error } = await supabaseServer
    .from('ai_generated_plans')
    .update({
      structured_plan_json: patched,
      plan_html: planHtml,
    })
    .eq('id', planId);

  if (error) {
    console.warn('[planEnhancementAsync] DB update failed', { plan_id: planId, error: error.message });
    return { ok: false, reason: error.message };
  }

  safeLog('plan_enhancement_ok', { planId, userId: bodyMetrics?.user_id ?? null });
  return { ok: true };
}

/**
 * Fire-and-forget async enhancement (neblokuje registraci).
 * @param {{ planId: string, userId?: string, bodyMetrics: object, planJson: object }} params
 */
export async function schedulePlanEnhancementAsync(params) {
  let bodyMetrics = params?.bodyMetrics;
  if (bodyMetrics?.user_id && !bodyMetrics?._coach_memory_summary) {
    try {
      const { buildPlanMemoryContext } = await import('./planMemoryContext');
      const mem = await buildPlanMemoryContext(String(bodyMetrics.user_id));
      bodyMetrics = {
        ...bodyMetrics,
        _coach_memory_summary: mem.summary,
        _coach_memory_meta: { itemsUsed: mem.itemsUsed, truncated: mem.truncated === true },
      };
    } catch {
      // non-fatal
    }
  }
  if (!shouldRunAsyncPlanEnhancement(bodyMetrics)) {
    return { queued: false, reason: 'enhancement_disabled' };
  }
  runPlanEnhancementAsync({ ...params, bodyMetrics }).catch((err) => {
    console.warn('[schedulePlanEnhancementAsync]', err?.message);
  });
  return { queued: true };
}
