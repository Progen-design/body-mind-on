// Admin: přegeneruje týdenní plán pro uživatele podle e-mailu (unified pipeline + persist).
// Auth: Authorization: Bearer ADMIN_TOKEN — stejně jako /api/admin/backfill-plan-html-from-structured.
import { generatePlanForEmailViaUnified } from '../../../lib/unifiedPlanPipeline';
import { addCalendarDaysIsoPrague, calendarDateIsoInPrague } from '../../../lib/czechCalendar';

function isAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;
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

  const validFrom = calendarDateIsoInPrague(new Date());
  const validUntil = addCalendarDaysIsoPrague(validFrom, 6);

  try {
    const result = await generatePlanForEmailViaUnified(email, {
      skipEmail,
      validFromOverride: validFrom,
      validUntilOverride: validUntil,
      generatedBy: 'admin-regenerate-user-plan',
      deactivateOld,
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
