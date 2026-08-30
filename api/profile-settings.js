// PATCH /api/profile-settings – uloží výchozí váhu a cíl do user_metadata a preference chytré váhy.
// Tyto hodnoty slouží jen pro odhad zhubnutí z tréninků, ne jako záznam ruční váhy.
//
// height_cm sem taky patří (modal ho posílá spolu s goal_weight_kg), ale
// zapisuje se přes lib/updateHeightCm.js — to je jediné místo, které umí
// výšku uložit správně (do body_metrics i metadat, s přepočtem kalorického
// cíle). Viz docs/DALSI_KROK.md 6.5.
import { supabaseServer } from '../lib/supabaseServer.js';
import { parseSmartScalePreference } from '../lib/smartScalePreference.js';
import { updateHeightCm } from '../lib/updateHeightCm.js';

export default async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Neplatná session' });

    const body = req.body || {};
    const start_weight_kg = body.start_weight_kg != null ? Number(body.start_weight_kg) : null;
    const goal_weight_kg = body.goal_weight_kg != null ? Number(body.goal_weight_kg) : null;
    const avatar_url = typeof body.avatar_url === 'string' ? body.avatar_url.trim() || null : null;
    const daily_email = body.daily_email === false ? false : body.daily_email === true ? true : undefined;
    const hasSmartScaleInput =
      body.smart_scale_choice !== undefined
      || body.smart_scale !== undefined
      || body.wants_body_tracking !== undefined
      || body.smart_scale_provider !== undefined;

    if (start_weight_kg != null && (start_weight_kg < 30 || start_weight_kg > 300)) {
      return res.status(400).json({ error: 'Výchozí váha musí být mezi 30 a 300 kg.' });
    }
    if (goal_weight_kg != null && (goal_weight_kg < 30 || goal_weight_kg > 300)) {
      return res.status(400).json({ error: 'Cílová váha musí být mezi 30 a 300 kg.' });
    }

    // Výška NENÍ jako cílová váha — vstupuje do BMR, takže se ukládá přes
    // lib/updateHeightCm.js (body_metrics + přepočet calories_target),
    // nikdy natvrdo do user_metadata. Viz docs/DALSI_KROK.md 6.5.
    let heightResult = null;
    if (body.height_cm != null) {
      heightResult = await updateHeightCm({ userId: user.id, user, heightCm: body.height_cm });
      if (!heightResult.ok) {
        return res.status(400).json({ error: heightResult.error });
      }
    }

    // Metadata mimo výšku — ta se do user_metadata už zapsala uvnitř
    // updateHeightCm(). Kdyby vstoupila i do tohohle `nextMeta`, endpoint by
    // ji do metadat zapsal podruhé (neškodně, ale zbytečně).
    const currentMeta = user.user_metadata || {};
    const nextMeta = {
      ...currentMeta,
      ...(start_weight_kg != null && { start_weight_kg }),
      ...(goal_weight_kg != null && { goal_weight_kg }),
    };
    if (hasSmartScaleInput) {
      const smartScaleMeta = parseSmartScalePreference(body);
      nextMeta.wants_body_tracking = smartScaleMeta.wants_body_tracking;
      nextMeta.smart_scale_provider = smartScaleMeta.smart_scale_provider;
    }

    const metaChanged = Object.keys(nextMeta).some((k) => nextMeta[k] !== currentMeta[k]);
    if (metaChanged) {
      const { data: updated, error: authErr } = await supabaseServer.auth.admin.updateUserById(user.id, {
        user_metadata: nextMeta,
      });
      if (authErr) {
        console.error('[profile-settings] updateUserById error:', authErr);
        return res.status(500).json({ error: authErr.message || 'Nepodařilo se uložit.' });
      }
    }

    // Odpověď ukazuje i výšku, i když se do `nextMeta` (a druhého zápisu
    // metadat výš) schválně nedostala.
    const responseMeta = heightResult?.ok
      ? { ...nextMeta, height_cm: heightResult.height_cm }
      : nextMeta;

    const profileUpdates = { id: user.id };
    if (avatar_url !== undefined) profileUpdates.avatar_url = avatar_url;
    if (daily_email !== undefined) profileUpdates.daily_email = daily_email;

    if (avatar_url !== undefined || daily_email !== undefined) {
      let toUpsert = { ...profileUpdates, updated_at: new Date().toISOString() };
      let profileErr = null;
      let result = await supabaseServer.from('profiles').upsert(toUpsert, { onConflict: 'id' });
      profileErr = result.error;

      if (profileErr && /does not exist|column.*not found|neexistuje/i.test(profileErr.message)) {
        delete toUpsert.updated_at;
        result = await supabaseServer.from('profiles').upsert(toUpsert, { onConflict: 'id' });
        profileErr = result.error;
      }
      if (profileErr && /does not exist|column.*not found|neexistuje/i.test(profileErr?.message)) {
        delete toUpsert.daily_email;
        if (Object.keys(toUpsert).length > 1) {
          result = await supabaseServer.from('profiles').upsert(toUpsert, { onConflict: 'id' });
          profileErr = result.error;
        }
      }

      if (profileErr) {
        console.error('[profile-settings] profiles upsert error:', profileErr);
        return res.status(500).json({ error: 'Nepodařilo se uložit nastavení.' });
      }
    }

    return res.status(200).json({
      ok: true,
      user_metadata: responseMeta,
      wants_body_tracking: nextMeta.wants_body_tracking === true,
      smart_scale_provider: nextMeta.smart_scale_provider ?? null,
      ...(avatar_url !== undefined && { avatar_url }),
      ...(daily_email !== undefined && { daily_email }),
      ...(heightResult?.ok && { calories_target: heightResult.calories_target }),
    });
  } catch (err) {
    console.error('[profile-settings] ERROR:', err);
    return res.status(500).json({ error: 'Chyba serveru' });
  }
}
