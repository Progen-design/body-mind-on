// Admin: odešle plán testovacímu příjemci bez změny vlastníka v DB.
// Auth: Authorization: Bearer ADMIN_TOKEN
// POST body:
//   owner_email (string, povinné)
//   recipient_email (string, povinné – žádný server default, proti omylu)
//   plan_id (string, volitelné – musí patřit user_id vlastníka)
import { supabaseServer } from '../../../lib/supabaseServer';
import { sendPlanEmail } from '../../../lib/mail';
import { getDefaultLoginUrl } from '../../../lib/siteUrls.js';
import { getPlanOutputMode } from '../../../lib/planOutputMode';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!isAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Neoprávněný přístup' });
  }

  const ownerEmail = String(req.body?.owner_email ?? '').trim().toLowerCase();
  const recipientEmail = String(req.body?.recipient_email ?? '').trim().toLowerCase();
  const planIdRaw = req.body?.plan_id != null ? String(req.body.plan_id).trim() : '';
  const dryRun = req.body?.dry_run === true || req.body?.dryRun === true;

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
      .select('id, plan_html, user_id, valid_from, valid_until, email')
      .eq('user_id', userId)
      .eq('id', planIdRaw)
      .maybeSingle();
    plan = r.data;
    planErr = r.error;
  } else {
    const r = await supabaseServer
      .from('ai_generated_plans')
      .select('id, plan_html, user_id, valid_from, valid_until, email')
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
  if (!plan?.plan_html || typeof plan.plan_html !== 'string') {
    return res.status(404).json({ ok: false, error: 'Plán nebo plan_html nenalezen pro daného vlastníka.' });
  }
  if (plan.user_id !== userId) {
    return res.status(403).json({ ok: false, error: 'Plán nepatří vlastníkovi.' });
  }

  if (dryRun) {
    return res.status(200).json({
      ok: true,
      dry_run: true,
      owner_email: ownerEmail,
      recipient_email: recipientEmail,
      plan_id: plan.id,
      valid_from: plan.valid_from ?? null,
      valid_until: plan.valid_until ?? null,
      plan_html_length: String(plan.plan_html).length,
    });
  }

  let firstName = null;
  try {
    const { data: bmRow } = await supabaseServer
      .from('body_metrics')
      .select('name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    firstName = bmRow?.name ?? null;
  } catch {
    firstName = null;
  }

  const planOutputMode = getPlanOutputMode(plan, null, {});

  const sendResult = await sendPlanEmail(recipientEmail, plan.plan_html, {
    loginUrl: getDefaultLoginUrl(),
    existingAccount: true,
    firstName,
    planOutputMode,
    accountEmailForLoginBlock: ownerEmail,
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
    plan_html_length: String(plan.plan_html).length,
  });
}
