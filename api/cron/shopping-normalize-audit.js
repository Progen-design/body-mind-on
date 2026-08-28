// GET/POST /api/cron/shopping-normalize-audit
// Scan active plans; log ingredient names the DICTIONARY does not know.
//
// Do 25. 8. 2026 se tu ptalo `resolveCanonicalName().matched`, což je porovnani
// proti konstante v lib/ingredientAliasSeed.js (74 kanonickych klicu), ne proti
// slovniku v databazi (376 surovin, 503 aliasu). Log se tim plnil surovinami,
// ktere slovnik zna, a watchdog je hlasil jako chybejici. Otazku "zna slovnik
// tuhle surovinu?" ted zodpovida jedine misto: `suroviny_mimo_slovnik()` v DB.
import { supabaseServer } from '../../lib/supabaseServer.js';
import {
  nazvySurovinVPlanech,
  radkyKZapisu,
  vsechnyNazvy,
} from '../../lib/shoppingNormalizeAudit.js';

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

    const podlePlanu = nazvySurovinVPlanech(plans || []);
    const nazvy = vsechnyNazvy(podlePlanu);

    // Jeden dotaz na vsechny nazvy naraz. Po jednom by to byly stovky
    // round-tripu; stahnout si slovnik a porovnavat v JS by znamenalo opsat
    // `normalizuj_nazev_suroviny` do JavaScriptu — a byli bychom zpatky
    // u dvou slovniku, ktere se rozejdou.
    let nezname = new Set();
    if (nazvy.length > 0) {
      const { data, error: rpcErr } = await supabaseServer
        .rpc('suroviny_mimo_slovnik', { p_nazvy: nazvy });

      if (rpcErr) {
        return res.status(500).json({ ok: false, error: rpcErr.message, started_at: startedAt });
      }
      nezname = new Set(data || []);
    }

    const upsertRows = radkyKZapisu(podlePlanu, nezname, startedAt);

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
      names_checked: nazvy.length,
      unknown_names: nezname.size,
      plans_with_misses: new Set(upsertRows.map((r) => r.plan_id)).size,
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
