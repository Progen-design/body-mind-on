// GET/POST /api/cron/shopping-normalize-audit
// Scan active plans; log ingredient names that fail canonical normalization.
import { supabaseServer } from '../../../lib/supabaseServer';
import {
  collectShoppingIngredientRecordsFromMeals,
  parseShoppingIngredientRecord,
} from '../../../lib/shoppingListAggregate.js';
import { resolveCanonicalName } from '../../../lib/ingredientNormalize.js';

function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'CRON_SECRET is not configured' };
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${secret}`) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = isCronAuthorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const startedAt = new Date().toISOString();

  try {
    const { data: plans, error: planErr } = await supabaseServer
      .from('ai_generated_plans')
      .select('id, structured_plan_json')
      .eq('is_active', true);

    if (planErr) {
      return res.status(500).json({ ok: false, error: planErr.message, started_at: startedAt });
    }

    /** @type {Map<string, Set<number>>} */
    const missesByPlan = new Map();

    for (const plan of plans || []) {
      const days = plan.structured_plan_json?.days || [];
      const meals = days.flatMap((d) => d?.meals || []);
      const records = collectShoppingIngredientRecordsFromMeals(meals);
      const unmapped = new Set();

      for (const ing of records) {
        const parsed = parseShoppingIngredientRecord(ing);
        if (!parsed?.name) continue;
        const resolved = resolveCanonicalName(parsed.name);
        if (!resolved.matched) unmapped.add(String(parsed.name).trim());
      }

      if (unmapped.size > 0) {
        missesByPlan.set(plan.id, unmapped);
      }
    }

    const upsertRows = [];
    for (const [planId, names] of missesByPlan) {
      for (const rawName of names) {
        upsertRows.push({ plan_id: planId, raw_name: rawName, seen_at: startedAt });
      }
    }

    if (upsertRows.length > 0) {
      const { error: upsertErr } = await supabaseServer
        .from('ingredient_normalization_misses')
        .upsert(upsertRows, { onConflict: 'raw_name,plan_id' });
      if (upsertErr) {
        return res.status(500).json({ ok: false, error: upsertErr.message, started_at: startedAt });
      }
    }

    return res.status(200).json({
      ok: true,
      plans_scanned: (plans || []).length,
      plans_with_misses: missesByPlan.size,
      miss_rows: upsertRows.length,
      started_at: startedAt,
    });
  } catch (err) {
    console.error('[shopping-normalize-audit]', err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      started_at: startedAt,
    });
  }
}
