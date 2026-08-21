// GET/POST /api/cron/sweep-catalog-activation — denní úklid (CRON_SECRET)
//
// Dva nezávislé sweepy na jednom tiku:
//   1. sweep_recipe_catalog_activation — druhá šance receptům
//   2. deactivate_expired_plans        — sundá plány po valid_until
//
// Logika je celá v SQL, tahle route ji jen spouští a loguje. Plánování zůstává
// ve vercel.json, aby bylo veškeré rozvrhování na jednom místě — pg_cron je sice
// dostupný, ale druhý plánovač znamená druhé místo, kam se dívat, když něco neběží.
import { isCronAuthorized } from '../../../lib/adminAuth';
import { supabaseServer } from '../../../lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = isCronAuthorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const startedAt = new Date().toISOString();

  try {
    const { data, error } = await supabaseServer.rpc('sweep_recipe_catalog_activation');
    if (error) throw new Error(error.message);

    // Deaktivace propadlých plánů jede na stejném denním tiku. Je to jiná doména
    // než katalog receptů, ale zakládat kvůli jednomu UPDATE druhý cron znamená
    // druhé místo, kam se dívat, když něco neběží — a to je horší než tenhle
    // kompromis. Selhání se loguje a NESHODÍ sweep katalogu, který už proběhl.
    let plans = null;
    let plansError = null;
    try {
      const { data: planData, error: planErr } = await supabaseServer.rpc('deactivate_expired_plans');
      if (planErr) throw new Error(planErr.message);
      plans = planData;
    } catch (err) {
      plansError = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({
        source: 'cron/sweep-catalog-activation',
        event: 'plans_error',
        started_at: startedAt,
        error: plansError,
      }));
    }

    console.log(JSON.stringify({
      source: 'cron/sweep-catalog-activation',
      event: 'done',
      started_at: startedAt,
      activated: data?.activated ?? 0,
      active_total: data?.active_total ?? null,
      plans_deactivated: plans?.deactivated ?? null,
      plans_active_total: plans?.active_total ?? null,
      plans_error: plansError,
    }));

    return res.status(200).json({ ok: true, started_at: startedAt, ...data, plans: plans ?? { error: plansError } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      source: 'cron/sweep-catalog-activation',
      event: 'error',
      started_at: startedAt,
      error: msg,
    }));
    return res.status(500).json({ ok: false, error: msg, started_at: startedAt });
  }
}
