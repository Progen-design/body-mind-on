// POST /api/quick-weight – přihlášený uživatel přidá jen váhu (a volitelně datum)
import { supabaseServer } from '../lib/supabaseServer.js';
import { enqueueAIEvent, triggerImmediateDecision } from '../lib/aiEvents.js';
// Meze sdilene s SPA, at klient i server rikaji totez.
import { CHYBA_VAHY, MAX_VAHA_KG, MIN_VAHA_KG } from '../lib/vahaMeze.js';
import { buildQuickWeightRow } from '../lib/quickWeightRow.js';

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
    if (weight_kg == null || !Number.isFinite(weight_kg) || weight_kg < MIN_VAHA_KG || weight_kg > MAX_VAHA_KG) {
      return res.status(400).json({ error: CHYBA_VAHY });
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

    const row = buildQuickWeightRow(latest, { userId: user.id, weightKg: weight_kg, createdAt: created_at });

    const { data, error } = await supabaseServer
      .from('body_metrics')
      .insert([row])
      .select()
      .single();

    if (error) {
      console.error('[quick-weight] insert error:', error);
      return res.status(500).json({ error: error.message || 'Nepodařilo se uložit váhu.' });
    }

    // Event-driven autonomy: quick weight entry behaves as a check-in signal.
    try {
      await supabaseServer.from('user_checkins').insert({
        user_id: user.id,
        weight: weight_kg,
        stress_level: latest?.stress_level ?? null,
        adherence_score: null,
        notes: 'quick_weight',
        created_at,
      });
      await enqueueAIEvent('user_checkin_created', user.id, { source: 'quick_weight' });
      await triggerImmediateDecision(user.id);
    } catch (autonomyErr) {
      console.warn('[quick-weight] autonomy reaction failed:', autonomyErr?.message || autonomyErr);
    }

    return res.status(201).json({ metric: data });
  } catch (err) {
    console.error('[quick-weight] ERROR:', err);
    return res.status(500).json({ error: 'Chyba serveru' });
  }
}
