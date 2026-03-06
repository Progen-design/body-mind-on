// /pages/api/send-shopping-list.js – pošle nákupní seznam na e-mail přihlášeného uživatele
import { supabaseServer } from '../../lib/supabaseServer';
import { requireActiveMembership } from '../../lib/membershipHelpers';
import { sendShoppingListEmail } from '../../lib/mail';

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

    const items = req.body?.items;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Očekává se pole položek (items)' });
    }
    const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim() : null;

    const result = await sendShoppingListEmail(email, items, title);

    if (!result.ok) {
      return res.status(500).json({ error: result.message || 'E-mail se nepodařilo odeslat.' });
    }
    return res.status(200).json({ ok: true, message: 'Nákupní seznam byl odeslán na tvůj e-mail.' });
  } catch (err) {
    console.error('[send-shopping-list]', err);
    return res.status(500).json({ error: 'Chyba serveru' });
  }
}
