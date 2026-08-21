// GET/POST/DELETE /api/body-measurements – skutečná tělesná měření
import { supabaseServer } from '../../lib/supabaseServer';
import { validateMeasurementInput } from '../../lib/progressIntegrity';

async function getUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Nejste přihlášen', status: 401 };
  const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
  if (userErr || !user) return { error: 'Neplatná session', status: 401 };
  return { user };
}

export default async function handler(req, res) {
  try {
    const authResult = await getUser(req);
    if (authResult.error) return res.status(authResult.status).json({ error: authResult.error });
    const { user } = authResult;

    if (req.method === 'GET') {
      const { data, error } = await supabaseServer
        .from('body_measurements')
        .select('*')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(200);
      if (error) {
        console.error('[body-measurements] GET error:', error);
        return res.status(500).json({ error: error.message || 'Nepodařilo se načíst měření.' });
      }
      return res.status(200).json({ measurements: data || [] });
    }

    if (req.method === 'POST') {
      const validation = validateMeasurementInput(req.body || {});
      if (!validation.ok) return res.status(400).json({ error: validation.error });

      const row = {
        user_id: user.id,
        measured_at: validation.values.measured_at,
        weight_kg: validation.values.weight_kg ?? null,
        waist_cm: validation.values.waist_cm ?? null,
        hips_cm: validation.values.hips_cm ?? null,
        chest_cm: validation.values.chest_cm ?? null,
        arm_cm: validation.values.arm_cm ?? null,
        source: 'manual',
      };

      const { data, error } = await supabaseServer
        .from('body_measurements')
        .insert([row])
        .select()
        .single();

      if (error) {
        console.error('[body-measurements] POST error:', error);
        return res.status(500).json({ error: error.message || 'Nepodařilo se uložit měření.' });
      }
      return res.status(201).json({ measurement: data });
    }

    if (req.method === 'DELETE') {
      const id = req.body?.id || req.query?.id;
      if (!id) return res.status(400).json({ error: 'Chybí ID měření.' });

      const { data: existing, error: fetchErr } = await supabaseServer
        .from('body_measurements')
        .select('id, source, user_id')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      if (!existing || existing.user_id !== user.id) {
        return res.status(404).json({ error: 'Měření nenalezeno.' });
      }
      if (existing.source !== 'manual') {
        return res.status(403).json({ error: 'Měření z integrace nelze smazat.' });
      }

      const { error: delErr } = await supabaseServer
        .from('body_measurements')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (delErr) return res.status(500).json({ error: delErr.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[body-measurements] ERROR:', err);
    return res.status(500).json({ error: 'Chyba serveru' });
  }
}
