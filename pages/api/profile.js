// /pages/api/profile.js - Vrací data přihlášeného uživatele
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
    if (userErr || !user) return res.status(401).json({ error: 'Neplatná session' });

    const userId = user.id;
    const email = user.email?.toLowerCase();

    const [metricsRes, plansRes] = await Promise.all([
      supabaseServer
        .from('body_metrics')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseServer
        .from('ai_generated_plans')
        .select('id, plan_type, daily_calories, macros, valid_from, valid_until, created_at, plan_html')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || null
      },
      body_metrics: metricsRes.data || [],
      plans: plansRes.data || []
    });
  } catch (err) {
    console.error('[profile] ERROR:', err);
    return res.status(500).json({ error: 'Chyba serveru' });
  }
}
