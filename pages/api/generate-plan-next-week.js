// POST /api/generate-plan-next-week – vygeneruje náhled jídelníčku na příští týden (s označenými jídly)
// Pro přihlášené uživatele s platným členstvím. Umožňuje ověřit, že označená jídla se zahrnou.
import { supabaseServer } from '../../lib/supabaseServer';
import { generatePlanForEmail, getNextWeekRange } from '../../lib/generatePlan';
import { getClientIp, isRateLimited } from '../../lib/rateLimit';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ip = getClientIp(req);
    if (isRateLimited(`generate-next-week:${ip}`, 3, 5 * 60 * 1000)) {
      res.setHeader('Retry-After', '300');
      return res.status(429).json({ error: 'Příliš mnoho požadavků. Zkus to za pár minut.' });
    }

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Neplatná session' });

    const email = user.email?.toLowerCase();
    if (!email) return res.status(400).json({ error: 'Chybí e-mail.' });

    const { from, until, startDate } = getNextWeekRange();

    const result = await generatePlanForEmail(email, {
      mealsOnly: true,
      validFromOverride: from,
      validUntilOverride: until,
      targetStartDate: startDate,
      skipEmail: true,
    });

    if (!result.ok) {
      return res.status(500).json({ error: result.message || 'Nepodařilo vygenerovat plán.' });
    }

    return res.status(200).json({
      ok: true,
      message: 'Jídelníček na příští týden vygenerován.',
      valid_from: from,
      valid_until: until,
    });
  } catch (err) {
    console.error('❌ /api/generate-plan-next-week:', err);
    return res.status(500).json({
      error: err?.message || 'Chyba při generování plánu.',
    });
  }
}
