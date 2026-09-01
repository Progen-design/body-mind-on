/**
 * PATCH /api/profile-body-data
 * Uloží váhu a datum narození bez přegenerování plánu.
 *
 * Výška (height_cm) jde přes lib/updateHeightCm.js — to je jediné místo,
 * které ji umí zapsat správně (do body_metrics i metadat, s přepočtem
 * kalorického cíle). Dřív se tu výška ukládala natvrdo v tomhle handleru
 * a `calories_target` se přepočítal, jen když přišla spolu s váhou — čistá
 * změna výšky se do BMR nepromítla. Viz docs/DALSI_KROK.md 6.5.
 */
import { supabaseServer } from '../lib/supabaseServer.js';
import { validateBirthDate } from '../lib/bodyMetricsBirthDate.js';
import { buildCalorieTargetBodyMetricsPatch, emitCalorieTargetChangedEvent } from '../lib/calorieTargetIntegrity.js';
import { updateHeightCm } from '../lib/updateHeightCm.js';

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
    const birth_date = typeof body.birth_date === 'string' ? body.birth_date.trim() : null;

    if (weight_kg != null && (weight_kg < 30 || weight_kg > 250)) {
      return res.status(400).json({ ok: false, error: 'Váha musí být mezi 30 a 250 kg.' });
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

      // docs/DALSI_KROK.md 8.1 — jedno z pěti míst, kde se `calories_target`
      // opravdu mění. `no-op`, pokud váha vůbec nepřišla (metricsUpdate pak
      // calories_target nemá) — `emitCalorieTargetChangedEvent` to samo pozná.
      await emitCalorieTargetChangedEvent(user.id, {
        oldCaloriesTarget: latest.calories_target,
        patch: metricsUpdate,
        source: 'weight_updated',
      });
    }

    if (birth_date) {
      const currentMeta = user.user_metadata || {};
      const nextMeta = {
        ...currentMeta,
        ...(birth_date ? { birth_date } : {}),
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

    // Zvlášť a AŽ TEĎ: updateHeightCm() si sám natáhne čerstvý poslední
    // řádek (už s novou váhou, pokud přišla ve stejném requestu), takže
    // calories_target vyjde z obou nových hodnot najednou, ne jen ze staré
    // výšky uložené výš.
    let heightResult = null;
    if (body.height_cm != null && body.height_cm !== '') {
      heightResult = await updateHeightCm({ userId: user.id, user, heightCm: body.height_cm });
      if (!heightResult.ok) {
        return res.status(400).json({ ok: false, error: heightResult.error });
      }
    }

    return res.status(200).json({
      ok: true,
      message: 'Tělesné údaje uloženy. Pro nový výpočet plánu bude potřeba vytvořit nový plán.',
      weight_kg,
      height_cm: heightResult?.height_cm ?? null,
      birth_date: birth_date || user.user_metadata?.birth_date || null,
      age: computedAge ?? metricsUpdate.age ?? null,
      plan_regenerated: false,
      ...(heightResult?.ok && { calories_target: heightResult.calories_target }),
    });
  } catch (err) {
    console.error('[profile-body-data]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Chyba serveru' });
  }
}
