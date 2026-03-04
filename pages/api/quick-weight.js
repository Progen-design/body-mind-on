// POST /api/quick-weight – přihlášený uživatel přidá jen váhu (a volitelně datum)
import { supabaseServer } from '../../lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Neplatná session' });

    const weight_kg = req.body?.weight_kg != null ? Number(req.body.weight_kg) : null;
    if (weight_kg == null || weight_kg < 30 || weight_kg > 300) {
      return res.status(400).json({ error: 'Váha musí být mezi 30 a 300 kg.' });
    }

    const dateStr = req.body?.date?.trim?.();
    if (dateStr && Number.isNaN(Date.parse(dateStr))) {
      return res.status(400).json({ error: 'Neplatné datum.' });
    }
    const created_at = dateStr
      ? new Date(dateStr).toISOString()
      : new Date().toISOString();

    const { data: latest, error: latestErr } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr || !latest) {
      return res.status(400).json({ error: 'Nejprve dokonči registraci (zadej výšku a váhu).' });
    }

    const row = {
      user_id: user.id,
      weight_kg,
      created_at,
      height_cm: latest?.height_cm ?? 170,
      email: latest?.email ?? user.email,
      name: latest?.name ?? user.user_metadata?.name ?? null,
      gender: latest?.gender ?? null,
      age: latest?.age ?? null,
      activity: latest?.activity ?? null,
      stress_level: latest?.stress_level ?? null,
      occupation: latest?.occupation ?? null,
      goal: latest?.goal ?? null,
      freq_choice: latest?.freq_choice ?? null,
      weekly_sessions_user: latest?.weekly_sessions_user ?? null,
      notes: latest?.notes ?? null,
      program: latest?.program ?? 'START',
    };

    const { data, error } = await supabaseServer
      .from('body_metrics')
      .insert([row])
      .select()
      .single();

    if (error) {
      console.error('[quick-weight] insert error:', error);
      return res.status(500).json({ error: error.message || 'Nepodařilo se uložit váhu.' });
    }
    return res.status(201).json({ metric: data });
  } catch (err) {
    console.error('[quick-weight] ERROR:', err);
    return res.status(500).json({ error: 'Chyba serveru' });
  }
}
