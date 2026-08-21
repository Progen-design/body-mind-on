/**
 * POST /api/plan/run-pending-weekly — spustí čekající týdenní plán uživatele.
 *
 * Volá ho profil po návratu ze Stripe checkoutu (`/profil?checkout=success`).
 * Webhook po aktivaci úlohu jen ZALOŽÍ — Stripe čeká na 200, takže generovat
 * v něm nejde. Bez tohohle endpointu by uživatel čekal na scheduler, kterého
 * žene GitHub Actions zhruba jednou za hodinu.
 *
 * NEZÁVODÍ S WEBHOOKEM. Redirect z checkoutu bývá rychlejší než doručení
 * webhooku, takže tady často žádná úloha ještě není. V tom případě si ji
 * endpoint založí sám přes `produceWeeklyTaskForUser` — dva zdroje téhož
 * insertu jsou bezpečné, protože idempotency klíč je v databázi a UNIQUE
 * druhý pokus odmítne.
 *
 * Bezpečné volat opakovaně: claim je podmíněný na `status = 'pending'`, takže
 * druhé zavolání (nebo souběh se schedulerem) vrátí `already_running` a nic
 * negeneruje.
 */
import { supabaseServer } from '../../lib/supabaseServer.js';
import { runPendingWeeklyTaskForUser } from '../../lib/runPendingPlanTask.js';

// Generování plánu je stejně dlouhé jako u registrace — stejný strop.
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

  const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
  if (userErr || !user?.id) return res.status(401).json({ error: 'Neplatná session' });

  try {
    const vysledek = await runPendingWeeklyTaskForUser(user.id);

    console.info('[plan/run-pending-weekly]', {
      user_id: user.id,
      status: vysledek.status,
      task_id: vysledek.task_id,
      plan_id: vysledek.plan_id,
      produced: vysledek.produced,
    });

    // `already_running` ani `retry_scheduled` nejsou chyby: úlohu bere
    // scheduler, resp. se zkusí znovu. Obojí je 200 s popisem, ať UI nemusí
    // rozlišovat chybu od „počkej chvíli“.
    return res.status(200).json({
      ok: vysledek.ok,
      status: vysledek.status,
      plan_id: vysledek.plan_id,
      produced: vysledek.produced,
      error: vysledek.error,
    });
  } catch (e) {
    console.error('[plan/run-pending-weekly] error', e);
    return res.status(500).json({ error: e?.message || 'Spuštění se nepodařilo' });
  }
}
