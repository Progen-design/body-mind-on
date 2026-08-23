// GET/POST /api/cron/sweep-catalog-activation — denní úklid (CRON_SECRET)
//
// Dva nezávislé sweepy na jednom tiku:
//   1. sweep_recipe_catalog_activation — druhá šance receptům
//   2. sync_plan_activation            — `is_active` na plán, který platí dnes
//
// Logika je celá v SQL, tahle route ji jen spouští a loguje. Plánování zůstává
// ve vercel.json, aby bylo veškeré rozvrhování na jednom místě — pg_cron je sice
// dostupný, ale druhý plánovač znamená druhé místo, kam se dívat, když něco neběží.
//
// ČAS BĚHU: 22:05 UTC, tedy 00:05 pražského času. Platnost plánu se láme
// o půlnoci, takže srovnání `is_active` musí přijít hned po ní. Dřív cron
// jel ve 3:30 UTC (5:30 v Praze) a příznak byl každý den prvních pět hodin
// pozadu. Sweep receptů je na čase nezávislý, veze se s tím.
import { isCronAuthorized } from '../../lib/adminAuth.js';
import { supabaseServer } from '../../lib/supabaseServer.js';

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

    // Srovnání příznaku `is_active` u plánů jede na stejném denním tiku. Je to
    // jiná doména než katalog receptů, ale zakládat kvůli jednomu UPDATE druhý
    // cron znamená druhé místo, kam se dívat, když něco neběží — a to je horší
    // než tenhle kompromis. Selhání se loguje a NESHODÍ sweep katalogu.
    //
    // DŘÍV TU BYLO `deactivate_expired_plans`, které umělo jen vypínat plány
    // po `valid_until`. Jenže každý generátor vypne všechny plány uživatele
    // a nový vloží jako aktivní — takže plán vygenerovaný dopředu vypnul ten,
    // který právě běžel, a nikdo to zpátky nezapnul. Změřeno 23. 8. 2026:
    // `is_active` měl plán s platností 27. 8. – 2. 9., zatímco plán na
    // probíhající týden (20. – 26. 8.) byl vypnutý.
    //
    // `sync_plan_activation` srovnává příznak v obou směrech a je idempotentní.
    // Musí běžet opakovaně, protože „platí dnes" se mění o půlnoci samo od
    // sebe, bez ohledu na to, jestli někdo něco vygeneroval.
    let plans = null;
    let plansError = null;
    try {
      const { data: planData, error: planErr } = await supabaseServer.rpc('sync_plan_activation');
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
      plans_activated: plans?.activated ?? null,
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
