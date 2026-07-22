// GET/POST /api/cron/import-spoonacular — daily bulk import (CRON_SECRET)
import { isCronAuthorized } from '../../../lib/adminAuth';
import {
  DEFAULT_CATALOG_IMPORT_FILTERS,
  runDailySpoonacularCatalogImport,
} from '../../../lib/spoonacular/catalogImport';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = isCronAuthorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  if (!process.env.SPOONACULAR_API_KEY) {
    return res.status(500).json({ error: 'SPOONACULAR_API_KEY is not configured' });
  }

  const startedAt = new Date().toISOString();
  console.log('[cron/import-spoonacular] start', startedAt);

  try {
    const result = await runDailySpoonacularCatalogImport();

    console.log('[cron/import-spoonacular] done', {
      imported: result.imported,
      updated: result.updated,
      quotaLeft: result.quotaLeft,
      requestsUsed: result.requestsUsed,
      stoppedReason: result.stoppedReason || null,
    });

    return res.status(200).json({
      ok: true,
      started_at: startedAt,
      imported: result.imported,
      updated: result.updated,
      quotaLeft: result.quotaLeft,
      requestsUsed: result.requestsUsed,
      filters: DEFAULT_CATALOG_IMPORT_FILTERS,
      stoppedReason: result.stoppedReason,
      byType: result.byType,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/import-spoonacular] error', msg);
    return res.status(500).json({ ok: false, error: msg, started_at: startedAt });
  }
}
