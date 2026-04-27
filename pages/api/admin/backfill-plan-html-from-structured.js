// Přerenderuje plan_html z structured_plan_json (bez nových volání Spoonacular).
// Auth: Authorization: Bearer ADMIN_TOKEN (stejně jako /api/admin/agents).
import { backfillPlanHtmlFromStructuredJson } from '../../../lib/planHtmlStructuredBackfill';

function isAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Neoprávněný přístup' });
  }

  try {
    const dryRun = req.body?.dry_run === true || req.body?.dryRun === true;
    const onlyActive = req.body?.only_active !== false && req.body?.onlyActive !== false;
    const skipUnchanged = req.body?.skip_unchanged !== false && req.body?.skipUnchanged !== false;
    const result = await backfillPlanHtmlFromStructuredJson({ dryRun, onlyActive, skipUnchanged });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[backfill-plan-html-from-structured]', err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
