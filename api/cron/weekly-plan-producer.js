// GET/POST /api/cron/weekly-plan-producer — denní zakládání weekly_plan_update (CRON_SECRET)
//
// ZATÍM NENÍ VE vercel.json. Endpoint existuje, plánovaný běh ne — první spuštění
// je ruční s ?dry_run=1, aby bylo vidět, co by vzniklo, dřív než něco vznikne.
//
// Producent běží mimo decision engine schválně: run-scheduler nemá záznam ve
// vercel.json a žene ho jen GitHub Actions, které deklarovaných 5 minut škrtí na
// zhruba hodinu. Produkce plánů na best-effort plánovači mimo Vercel viset nemá.
//
// POŘADÍ JE ZÁVAZNÉ: deactivate_expired_plans (sweep cron, 3:30) musí proběhnout
// PŘED producentem, jinak producent vidí včerejší plány jako aktivní a doběhovou
// větev „nemá aktivní plán“ nikdy nevyhodnotí.
import { isCronAuthorized } from '../../lib/adminAuth.js';
import { runWeeklyPlanProducer } from '../../lib/weeklyPlanProducer.js';
import { pripravZamceneUkazky } from '../../lib/zamcenyTydenPlanu.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = isCronAuthorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const dryRun = req.query?.dry_run === '1'
    || req.query?.dry_run === 'true'
    || req.body?.dry_run === true;

  const startedAt = new Date().toISOString();

  try {
    const vysledek = await runWeeklyPlanProducer({ dryRun });

    // ZAMČENÉ UKÁZKY PRO TRIAL — běží tady, protože je to tentýž okamžik
    // a tatáž otázka: „komu za chvíli dojde plán?". Rozdíl je jen v tom, že
    // trialu nevzniká úloha, ale rovnou plán označený `locked`.
    //
    // Selhání ukázek NESMÍ shodit produkci opravdových plánů — ty jsou pro
    // platící a mají přednost.
    let ukazky = null;
    let ukazkyError = null;
    try {
      ukazky = await pripravZamceneUkazky({ dryRun });
    } catch (err) {
      ukazkyError = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({
        source: 'cron/weekly-plan-producer',
        event: 'zamcene_ukazky_error',
        error: ukazkyError,
      }));
    }

    console.log(JSON.stringify({
      source: 'cron/weekly-plan-producer',
      event: 'zamcene_ukazky',
      vyrobeno: ukazky?.vyrobeno ?? 0,
      kandidatu: ukazky?.kandidatu ?? 0,
      chyby: ukazky?.chyby ?? [],
      error: ukazkyError,
    }));

    console.log(JSON.stringify({
      source: 'cron/weekly-plan-producer',
      event: dryRun ? 'dry_run' : 'done',
      started_at: startedAt,
      created: vysledek.created,
      duplicates: vysledek.duplicates ?? 0,
      candidates_total: vysledek.candidates_total ?? 0,
      deferred_over_limit: vysledek.deferred_over_limit ?? 0,
      errors: vysledek.errors?.length ?? 0,
    }));

    return res.status(200).json({
      ok: true,
      started_at: startedAt,
      ...vysledek,
      zamcene_ukazky: ukazky ?? { error: ukazkyError },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      source: 'cron/weekly-plan-producer',
      event: 'error',
      started_at: startedAt,
      error: msg,
    }));
    return res.status(500).json({ ok: false, error: msg, started_at: startedAt });
  }
}
