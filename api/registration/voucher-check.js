/**
 * POST /api/registration/voucher-check
 * Body: { kod }
 * Response: { platny: true, dny } | { platny: false, hlaska }
 *
 * JEN OVĚŘENÍ, NIC NEZAPISUJE. Registrace se ptá dřív, než účet existuje,
 * ať člověk hned ví, jestli kód sedí (a vidí „30 dní zdarma"). Samotné
 * uplatnění je atomický UPDATE při založení členství v api/body-metrics.js.
 *
 * Veřejné (uživatel ještě nemá účet) → rate limit proti zkoušení kódů.
 * Odpověď neprozrazuje nic kromě platnosti a počtu dní.
 */
import { enforcePublicEndpointRateLimit } from '../../lib/rateLimit.js';
import { supabaseServer } from '../../lib/supabaseServer.js';
import { HLASKY_POUKAZU, overPoukaz } from '../../lib/poukazy.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ platny: false });
  }

  try {
    const rateLimit = await enforcePublicEndpointRateLimit(req, {
      scope: 'registration-voucher-check',
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (rateLimit.limited) {
      if (rateLimit.retryAfterSec) res.setHeader('Retry-After', String(rateLimit.retryAfterSec));
      return res.status(429).json({ platny: false, hlaska: rateLimit.message });
    }

    const vysledek = await overPoukaz(supabaseServer, req.body?.kod);
    if (vysledek.platny) return res.status(200).json({ platny: true, dny: vysledek.dny });
    return res.status(200).json({ platny: false, hlaska: vysledek.hlaska });
  } catch (err) {
    console.error('[registration/voucher-check]', err?.message || err);
    return res.status(200).json({ platny: false, hlaska: HLASKY_POUKAZU.chyba });
  }
}
