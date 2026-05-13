// Admin: odešle plán testovacímu příjemci bez změny vlastníka v DB.
// Auth: Authorization: Bearer ADMIN_TOKEN
// POST body:
//   owner_email (string, povinné)
//   recipient_email (string, povinné – žádný server default, proti omylu)
//   plan_id (string, volitelné)
//   dry_run (bool) – jen náhled metadat
//   plan_output_mode (string, volitelné) – výchozí nutrition_training (plán v e-mailu vč. tréninku, dle formátu e-mailu)
import { supabaseServer } from '../../../lib/supabaseServer';
import { sendPlanEmail } from '../../../lib/mail';
import { getDefaultLoginUrl } from '../../../lib/siteUrls.js';
import { normalizePlanOutputMode } from '../../../lib/planOutputMode';
import { renderPlanHtmlFromStructured } from '../../../lib/planRenderer';
import { buildDayHeadingOverridesFromStructuredPlan } from '../../../lib/planDayHeadingFormat.js';

function isAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;
}

async function resolveUserIdByOwnerEmail(ownerEmail) {
  const e = String(ownerEmail || '').trim().toLowerCase();
  if (!e) return null;
  const { data: prof, error: pErr } = await supabaseServer
    .from('profiles')
    .select('id')
    .eq('email', e)
    .maybeSingle();
  if (!pErr && prof?.id) return prof.id;

  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseServer.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const batch = data?.users || [];
    const u = batch.find((x) => (x.email || '').toLowerCase() === e);
    if (u?.id) return u.id;
    if (batch.length < 200) break;
  }
  return null;
}

function buildHtmlForEmail(planRow, userId, ownerEmail, bmRow) {
  const json = planRow.structured_plan_json;
  if (json && typeof json === 'object' && Array.isArray(json.days) && json.days.length > 0) {
    const bm = bmRow ? { ...bmRow, user_id: userId, email: ownerEmail } : { user_id: userId, email: ownerEmail };
    return renderPlanHtmlFromStructured(json, bm);
  }
  if (planRow.plan_html && typeof planRow.plan_html === 'string') return planRow.plan_html;
  return '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!isAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Neoprávněný přístup' });
  }

  try {
    const ownerEmail = String(req.body?.owner_email ?? '').trim().toLowerCase();
    const recipientEmail = String(req.body?.recipient_email ?? '').trim().toLowerCase();
    const planIdRaw = req.body?.plan_id != null ? String(req.body.plan_id).trim() : '';
    const dryRun = req.body?.dry_run === true || req.body?.dryRun === true;

    const rawMode =
      req.body?.plan_output_mode ??
      req.body?.planOutputMode ??
      process.env.TEST_PLAN_EMAIL_OUTPUT_MODE ??
      'nutrition_training';
    const planOutputMode = normalizePlanOutputMode(rawMode);

    if (!ownerEmail || !ownerEmail.includes('@')) {
      return res.status(400).json({ ok: false, error: 'Chybí platný owner_email.' });
    }
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return res.status(400).json({
        ok: false,
        error: 'Chybí platný recipient_email (vždy explicitně v těle požadavku).',
      });
    }

    const userId = await resolveUserIdByOwnerEmail(ownerEmail);
    if (!userId) {
      return res.status(404).json({ ok: false, error: 'Vlastník (owner_email) nenalezen.' });
    }

    let plan = null;
    let planErr = null;

    if (planIdRaw) {
      const r = await supabaseServer
        .from('ai_generated_plans')
        .select('id, plan_html, structured_plan_json, user_id, valid_from, valid_until, email')
        .eq('user_id', userId)
        .eq('id', planIdRaw)
        .maybeSingle();
      plan = r.data;
      planErr = r.error;
    } else {
      const r = await supabaseServer
        .from('ai_generated_plans')
        .select('id, plan_html, structured_plan_json, user_id, valid_from, valid_until, email')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      plan = r.data;
      planErr = r.error;
    }

    if (planErr) {
      return res.status(500).json({ ok: false, error: planErr.message });
    }
    if (!plan || plan.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Plán nenalezen nebo nepatří vlastníkovi.' });
    }

    const { data: bmFull } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const htmlSource = buildHtmlForEmail(plan, userId, ownerEmail, bmFull);
    if (!htmlSource || typeof htmlSource !== 'string' || !htmlSource.trim()) {
      return res.status(404).json({ ok: false, error: 'Nepodařilo se sestavit HTML plánu (chybí structured_plan_json i plan_html).' });
    }

    const renderedFromStructured = !!(
      plan.structured_plan_json &&
      typeof plan.structured_plan_json === 'object' &&
      Array.isArray(plan.structured_plan_json.days) &&
      plan.structured_plan_json.days.length > 0
    );

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        dry_run: true,
        owner_email: ownerEmail,
        recipient_email: recipientEmail,
        plan_id: plan.id,
        valid_from: plan.valid_from ?? null,
        valid_until: plan.valid_until ?? null,
        plan_html_length: htmlSource.length,
        rendered_from_structured: renderedFromStructured,
        plan_output_mode: planOutputMode,
      });
    }

    let firstName = null;
    try {
      firstName = bmFull?.name ?? null;
    } catch {
      firstName = null;
    }

    const dayHeadingOverrides = buildDayHeadingOverridesFromStructuredPlan(plan.structured_plan_json, plan.valid_from);

    const sendResult = await sendPlanEmail(recipientEmail, htmlSource, {
      loginUrl: getDefaultLoginUrl(),
      existingAccount: true,
      firstName,
      planOutputMode,
      accountEmailForLoginBlock: ownerEmail,
      bodyMetrics: bmFull ?? undefined,
      dayHeadingOverrides: dayHeadingOverrides ?? undefined,
      structuredPlanJson: plan.structured_plan_json ?? undefined,
      validFrom: plan.valid_from ?? undefined,
      planId: plan.id,
    });

    if (!sendResult?.ok) {
      return res.status(500).json({
        ok: false,
        error: sendResult?.message || 'Odeslání selhalo.',
      });
    }

    return res.status(200).json({
      ok: true,
      owner_email: ownerEmail,
      recipient_email: recipientEmail,
      plan_id: plan.id,
      valid_from: plan.valid_from ?? null,
      valid_until: plan.valid_until ?? null,
      plan_html_length: htmlSource.length,
      rendered_from_structured: renderedFromStructured,
      plan_output_mode: planOutputMode,
    });
  } catch (err) {
    const msg = err && typeof err.message === 'string' ? err.message.slice(0, 240) : 'internal_error';
    console.error('[send-test-plan-email]', { route: 'send-test-plan-email', message: msg });
    return res.status(500).json({
      ok: false,
      error: msg || 'Interní chyba při přípravě testovacího e-mailu.',
    });
  }
}
