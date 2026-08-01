// GET/POST /api/cron/sweep-catalog-activation — denní druhá šance receptům (CRON_SECRET)
//
// Logika je celá v SQL (sweep_recipe_catalog_activation), tahle route ji jen spouští
// a loguje. Plánování zůstává ve vercel.json, aby bylo veškeré rozvrhování na jednom
// místě — pg_cron je sice dostupný, ale druhý plánovač znamená druhé místo, kam se
// dívat, když něco neběží.
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

    console.log(JSON.stringify({
      source: 'cron/sweep-catalog-activation',
      event: 'done',
      started_at: startedAt,
      activated: data?.activated ?? 0,
      active_total: data?.active_total ?? null,
    }));

    return res.status(200).json({ ok: true, started_at: startedAt, ...data });
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
