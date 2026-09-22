// /api/admin/integrations/withings.js
/**
 * ADMIN: OAUTH ÚDAJE WITHINGS.
 *
 * GET  — stav integrace: je nastavená? odkud se čte? posledních šest znaků
 *        Client ID? Secret se NEVRACÍ NIKDY, ani zašifrovaný, ani zkrácený.
 * POST — uloží { client_id, client_secret } zašifrované do DB (upsert).
 *
 * Auth je `isAdmin(req)` z lib/adminAuth.js — Bearer ADMIN_TOKEN, stejně jako
 * zbytek `api/admin/*`. Token v query nebo v těle se nepřijímá: URL a těla
 * requestů končí v logách.
 */
import { isAdmin } from '../../../lib/adminAuth.js';
import {
  INTEGRACE_WITHINGS,
  maskaKonce,
  nactiUdajeIntegrace,
  ulozUdajeIntegrace,
  vyberKlientskeUdaje,
} from '../../../lib/integrationCredentials.js';

function envValue(...parts) {
  return process.env[parts.join('')];
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Neoprávněný přístup' });
  }

  try {
    if (req.method === 'GET') {
      const zDb = await nactiUdajeIntegrace(INTEGRACE_WITHINGS);
      const envClientId = String(envValue('WITHINGS_CLIENT_', 'ID') || '').trim();
      const envClientSecret = String(envValue('WITHINGS_CLIENT_', 'SECRET') || '').trim();

      // Odkud by se údaje vzaly TEĎ — přes tutéž čistou funkci, jakou
      // používá resolveWithingsCredentials(). Kdyby si to endpoint počítal
      // po svém, mohl by hlásit „nastaveno" u něčeho, co OAuth nepoužije.
      const { clientId, zdroj } = vyberKlientskeUdaje(zDb, {
        clientId: envClientId,
        clientSecret: envClientSecret,
      });

      return res.status(200).json({
        ok: true,
        integration_key: INTEGRACE_WITHINGS,
        configured: Boolean(zdroj),
        source: zdroj,
        client_id_masked: zdroj ? maskaKonce(clientId) : null,
        updated_at: zDb?.updatedAt || null,
        updated_by: zDb?.updatedBy || null,
        env_fallback_available: Boolean(envClientId && envClientSecret),
      });
    }

    const { client_id: clientId, client_secret: clientSecret } = req.body || {};
    if (!String(clientId || '').trim() || !String(clientSecret || '').trim()) {
      return res.status(400).json({ error: 'Client ID i Client Secret musí být vyplněné.' });
    }

    await ulozUdajeIntegrace(INTEGRACE_WITHINGS, {
      clientId,
      clientSecret,
      updatedBy: 'admin',
    });

    // Odpověď nese jen to, co šlo dovnitř — maskované ID, žádný secret.
    return res.status(200).json({
      ok: true,
      integration_key: INTEGRACE_WITHINGS,
      configured: true,
      source: 'db',
      client_id_masked: maskaKonce(clientId),
    });
  } catch (err) {
    console.error('[admin/integrations/withings]', err);
    return res.status(err?.statusCode || 500).json({
      error: err?.message || 'Nelze uložit údaje integrace.',
    });
  }
}
