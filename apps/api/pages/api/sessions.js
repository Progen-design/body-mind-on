// /pages/api/sessions.js
import { supabaseServer } from '../../lib/supabaseServer'; // serverový klient s SERVICE_ROLE

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { duration } = req.body || {};
    const dur = Number(duration);
    const PRICE = { 30: 790, 60: 1190, 90: 1690 };
    if (![30, 60, 90].includes(dur)) return res.status(400).json({ error: 'Neplatná délka (30/60/90)' });

    const price_czk = PRICE[dur];

    const { error } = await supabaseServer.from('sessions').insert({
      user_id: user.id,
      duration_min: dur,
      price_czk,
      status: 'new',
    });
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[sessions]', err);
    return res.status(500).json({ error: 'Chyba serveru' });
  }
}
