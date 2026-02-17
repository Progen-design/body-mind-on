// /pages/api/my-metrics.js – vrací body_metrics přihlášeného uživatele
import { supabaseServer } from '../../lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: rows, error } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('my-metrics error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ data: rows || [], email: user.email });
  } catch (err) {
    console.error('[my-metrics]', err);
    return res.status(500).json({ error: err?.message || 'Chyba serveru' });
  }
}
