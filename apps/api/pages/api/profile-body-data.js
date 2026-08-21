/**
 * PATCH /api/profile-body-data
 * Uloží váhu, výšku a datum narození bez přegenerování plánu.
 */
import { supabaseServer } from '../../lib/supabaseServer';
import { validateBirthDate } from '../../lib/bodyMetricsBirthDate.js';
import { buildCalorieTargetBodyMetricsPatch } from '../../lib/calorieTargetIntegrity.js';

export default async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ ok: false, error: 'Neplatná session' });

    const body = req.body || {};
    const weight_kg = body.weight_kg != null && body.weight_kg !== '' ? Number(body.weight_kg) : null;
    const height_cm = body.height_cm != null && body.height_cm !== '' ? Number(body.height_cm) : null;
    const birth_date = typeof body.birth_date === 'string' ? body.birth_date.trim() : null;

    if (weight_kg != null && (weight_kg < 30 || weight_kg > 250)) {
      return res.status(400).json({ ok: false, error: 'Váha musí být mezi 30 a 250 kg.' });
    }
    if (height_cm != null && (height_cm < 120 || height_cm > 230)) {
      return res.status(400).json({ ok: false, error: 'Výška musí být mezi 120 a 230 cm.' });
    }

    let computedAge = null;
    if (birth_date) {
      const v = validateBirthDate(birth_date);
      if (!v.valid) return res.status(400).json({ ok: false, error: v.error });
      computedAge = v.age;
    }

    const { data: latest, error: latestErr } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr || !latest?.id) {
      return res.status(400).json({ ok: false, error: 'Nejprve dokonči registraci.' });
    }

    const metricsUpdate = {};
    if (weight_kg != null) metricsUpdate.weight_kg = weight_kg;
    if (height_cm != null) metricsUpdate.height_cm = height_cm;
    if (computedAge != null) metricsUpdate.age = computedAge;
    if (birth_date) metricsUpdate.birth_date = birth_date;
    if (weight_kg != null) {
      Object.assign(
        metricsUpdate,
        buildCalorieTargetBodyMetricsPatch({ ...latest, ...metricsUpdate }, { forceRecalculate: true }),
      );
    }

    if (Object.keys(metricsUpdate).length > 0) {
      let { error: updErr } = await supabaseServer
        .from('body_metrics')
        .update(metricsUpdate)
        .eq('id', latest.id);
      if (updErr && /birth_date|does not exist|column/i.test(updErr.message || '')) {
        const fallbackUpdate = { ...metricsUpdate };
        delete fallbackUpdate.birth_date;
        ({ error: updErr } = await supabaseServer
          .from('body_metrics')
          .update(fallbackUpdate)
          .eq('id', latest.id));
      }
      if (updErr) {
        console.error('[profile-body-data] body_metrics update', updErr);
        return res.status(500).json({ ok: false, error: 'Nepodařilo uložit tělesné údaje.' });
      }
    }

    if (birth_date || height_cm != null) {
      const currentMeta = user.user_metadata || {};
      const nextMeta = {
        ...currentMeta,
        ...(birth_date ? { birth_date } : {}),
        ...(height_cm != null ? { height_cm } : {}),
        ...(weight_kg != null ? { weight_kg } : {}),
      };
      const { error: authErr } = await supabaseServer.auth.admin.updateUserById(user.id, {
        user_metadata: nextMeta,
      });
      if (authErr) {
        console.error('[profile-body-data] user_metadata update', authErr);
        return res.status(500).json({ ok: false, error: 'Nepodařilo uložit datum narození.' });
      }
    }

    return res.status(200).json({
      ok: true,
      message: 'Tělesné údaje uloženy. Pro nový výpočet plánu bude potřeba vytvořit nový plán.',
      weight_kg,
      height_cm,
      birth_date: birth_date || user.user_metadata?.birth_date || null,
      age: computedAge ?? metricsUpdate.age ?? null,
      plan_regenerated: false,
    });
  } catch (err) {
    console.error('[profile-body-data]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Chyba serveru' });
  }
}
