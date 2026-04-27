// /pages/api/send-plan-again.js – pošle aktuální plán znovu na e-mail přihlášeného uživatele
import { supabaseServer } from '../../lib/supabaseServer';
import { requireActiveMembership } from '../../lib/membershipHelpers';
import { sendPlanEmail } from '../../lib/mail';
import { getDefaultLoginUrl } from '../../lib/siteUrls.js';

const loginUrl = getDefaultLoginUrl();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Pouze POST' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Neplatná session' });

    const membershipCheck = await requireActiveMembership(user.id);
    if (!membershipCheck.allowed) {
      return res.status(membershipCheck.status || 403).json({ error: membershipCheck.error });
    }

    const email = user.email?.toLowerCase();
    if (!email) return res.status(400).json({ error: 'Uživatel nemá e-mail' });

    let { data: plans } = await supabaseServer
      .from('ai_generated_plans')
      .select('id, plan_html, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!plans?.length && email) {
      const { data: plansByEmail } = await supabaseServer
        .from('ai_generated_plans')
        .select('id, plan_html, created_at')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1);
      plans = plansByEmail;
    }

    const plan = plans?.[0];
    const planHtml = plan?.plan_html;
    if (!planHtml || typeof planHtml !== 'string') {
      return res.status(404).json({ error: 'Nemáš žádný uložený plán. Vygeneruje se při registraci.' });
    }

    let firstName = null;
    try {
      const { data: bmRow } = await supabaseServer
        .from('body_metrics')
        .select('name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      firstName = bmRow?.name ?? null;
    } catch {
      firstName = null;
    }

    const result = await sendPlanEmail(email, planHtml, {
      loginUrl,
      existingAccount: true,
      firstName,
    });

    if (!result.ok) {
      return res.status(500).json({ error: result.message || 'E-mail se nepodařilo odeslat.' });
    }
    return res.status(200).json({ ok: true, message: 'Plán byl odeslán na tvůj e-mail.' });
  } catch (err) {
    console.error('[send-plan-again]', err);
    return res.status(500).json({ error: 'Chyba serveru' });
  }
}
