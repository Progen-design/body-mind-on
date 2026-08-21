// Jednorázová / admin oprava: doplní name_cs ve structured_plan_json z exercise_asset_registry.
// Auth: Authorization: Bearer ADMIN_TOKEN (stejně jako /api/admin/agents).
import { backfillActivePlansExerciseNameCsFromRegistry } from '../../../lib/planExerciseNameCsBackfill';

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
    const result = await backfillActivePlansExerciseNameCsFromRegistry({ dryRun });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[backfill-exercise-name-cs]', err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
