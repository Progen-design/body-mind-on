// GET/POST /api/cron/stripe-reconcile — denní rekonciliace Stripe ↔ DB
//
// GET  = Vercel cron (Bearer CRON_SECRET), denně 04:30 UTC (vercel.json).
// POST = ruční běh z adminu (Bearer ADMIN_TOKEN, nebo CRON_SECRET).
//        První ruční běh po nasazení migrace 20260925200000 = backfill.
//
// Co dělá, je v lib/stripeReconcile.js. Stripe v produkci běží na LIVE
// klíčích — rekonciliace ze Stripe jen ČTE (retrieve/list), nic nemění.
import Stripe from 'stripe';
import { isAdmin, isCronAuthorized } from '../../lib/adminAuth.js';
import { reconcile } from '../../lib/stripeReconcile.js';

/** @param {{ stripe?: (klic: string) => any, reconcile?: typeof reconcile }} [zavislosti] */
export function vytvorHandler(zavislosti = {}) {
  const noveStripe = zavislosti.stripe || ((klic) => new Stripe(klic));
  const spust = zavislosti.reconcile || reconcile;

  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const cron = isCronAuthorized(req);
    const povoleno = cron.ok || (req.method === 'POST' && isAdmin(req));
    if (!povoleno) return res.status(cron.status === 500 && req.method === 'GET' ? 500 : 401).json({ error: cron.error || 'Unauthorized' });

    const klic = process.env.STRIPE_SECRET_KEY;
    if (!klic) return res.status(500).json({ error: 'STRIPE_SECRET_KEY chybí' });

    const zacatek = Date.now();
    try {
      const vysledek = await spust({ stripe: noveStripe(klic) });
      const souhrn = {
        ok: true,
        run_id: vysledek.runId,
        subscriptions: vysledek.pocet,
        zmen: vysledek.zmen,
        alertu: vysledek.alerty.length,
        alerty: vysledek.alerty.map((a) => a.kod),
        trvani_ms: Date.now() - zacatek,
      };
      console.info('[stripe-reconcile] hotovo', souhrn);
      return res.status(200).json(souhrn);
    } catch (err) {
      console.error('[stripe-reconcile] selhalo:', err?.message || err);
      return res.status(500).json({ ok: false, error: 'Rekonciliace selhala' });
    }
  };
}

export default vytvorHandler();
