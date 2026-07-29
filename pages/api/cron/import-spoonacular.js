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

  const dryRun = req.query?.dry_run === '1'
    || req.query?.dry_run === 'true'
    || process.env.SPOONACULAR_IMPORT_DRY_RUN === '1';

  const startedAt = new Date().toISOString();
  console.log(JSON.stringify({
    source: 'cron/import-spoonacular',
    event: 'start',
    started_at: startedAt,
    dry_run: dryRun,
  }));

  try {
    const result = await runDailySpoonacularCatalogImport({ dryRun });

    console.log(JSON.stringify({
      source: 'cron/import-spoonacular',
      event: 'done',
      started_at: startedAt,
      run_id: result.runId,
      dry_run: result.dryRun,
      imported: result.imported,
      fetched: result.fetched,
      skipped_duplicate: result.skipped_duplicate,
      skipped_filter: result.skipped_filter,
      skipped_filter_reasons: result.skipped_filter_reasons,
      quotaLeft: result.quotaLeft,
      requestsUsed: result.requestsUsed,
      pointsUsed: result.pointsUsed,
    }));

    return res.status(200).json({
      ok: true,
      started_at: startedAt,
      run_id: result.runId,
      dry_run: result.dryRun,
      imported: result.imported,
      updated: result.updated,
      fetched: result.fetched,
      skipped_duplicate: result.skipped_duplicate,
      skipped_filter: result.skipped_filter,
      skipped_filter_reasons: result.skipped_filter_reasons,
      rejected: result.rejected,
      quotaLeft: result.quotaLeft,
      requestsUsed: result.requestsUsed,
      pointsUsed: result.pointsUsed,
      filters: DEFAULT_CATALOG_IMPORT_FILTERS,
      byType: result.byType,
      errors: result.errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      source: 'cron/import-spoonacular',
      event: 'error',
      error: msg,
      started_at: startedAt,
    }));
    return res.status(500).json({ ok: false, error: msg, started_at: startedAt });
  }
}
