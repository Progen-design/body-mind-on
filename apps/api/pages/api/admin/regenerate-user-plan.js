// Admin: přegeneruje týdenní plán pro uživatele podle e-mailu (unified pipeline + persist).
// Auth: Authorization: Bearer ADMIN_TOKEN — stejně jako /api/admin/backfill-plan-html-from-structured.
import { generatePlanForEmailViaUnified } from '../../../lib/unifiedPlanPipeline';
import { addCalendarDaysIsoPrague, calendarDateIsoInPrague } from '../../../lib/czechCalendar';

function isAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;
}

function optionalIsoDate(value) {
  const s = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!isAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Neoprávněný přístup' });
  }

  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'Chybí platný e-mail.' });
  }

  const skipEmail = req.body?.skip_email !== false && req.body?.skipEmail !== false;
  const deactivateOld = req.body?.deactivate_old !== false && req.body?.deactivateOld !== false;
  const validFromOverride = optionalIsoDate(req.body?.valid_from ?? req.body?.validFrom);
  const validUntilOverride = optionalIsoDate(req.body?.valid_until ?? req.body?.validUntil);
  const generatedBy = String(req.body?.generated_by ?? req.body?.generatedBy ?? 'admin-regenerate-user-plan').trim()
    || 'admin-regenerate-user-plan';

  const validFrom = validFromOverride || calendarDateIsoInPrague(new Date());
  const validUntil = validUntilOverride || addCalendarDaysIsoPrague(validFrom, 6);

  const simpleStartMode = req.body?.simple_start_mode === true || req.body?.simpleStartMode === true;
  const plan_scope = req.body?.plan_scope ?? (simpleStartMode ? 'initial_7_day_trial' : null);

  try {
    const result = await generatePlanForEmailViaUnified(email, {
      skipEmail,
      validFromOverride: validFrom,
      validUntilOverride: validUntil,
      generatedBy,
      deactivateOld,
      ...(simpleStartMode ? { simpleStartMode: true, plan_scope: plan_scope || 'initial_7_day_trial', onboardingSoftGate: true } : {}),
    });

    if (!result.ok) {
      return res.status(422).json({ ok: false, message: result.message || 'Generování selhalo.' });
    }

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin/regenerate-user-plan]', err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
