// PATCH /api/profile-settings – uloží údaje pro výpočet (výchozí váha, cíl, výška) do user_metadata
// Tyto hodnoty slouží jen pro odhad zhubnutí z tréninků, ne jako záznam ruční váhy.
import { supabaseServer } from '../../lib/supabaseServer';

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
    const height_cm = body.height_cm != null ? Number(body.height_cm) : null;
    const avatar_url = typeof body.avatar_url === 'string' ? body.avatar_url.trim() || null : null;
    const daily_email = body.daily_email === false ? false : body.daily_email === true ? true : undefined;

    if (start_weight_kg != null && (start_weight_kg < 30 || start_weight_kg > 300)) {
      return res.status(400).json({ error: 'Výchozí váha musí být mezi 30 a 300 kg.' });
    }
    if (goal_weight_kg != null && (goal_weight_kg < 30 || goal_weight_kg > 300)) {
      return res.status(400).json({ error: 'Cílová váha musí být mezi 30 a 300 kg.' });
    }
    if (height_cm != null && (height_cm < 100 || height_cm > 250)) {
      return res.status(400).json({ error: 'Výška musí být mezi 100 a 250 cm.' });
    }

    const currentMeta = user.user_metadata || {};
    const nextMeta = {
      ...currentMeta,
      ...(start_weight_kg != null && { start_weight_kg }),
      ...(goal_weight_kg != null && { goal_weight_kg }),
      ...(height_cm != null && { height_cm }),
    };

    if (Object.keys(nextMeta).some((k) => nextMeta[k] !== currentMeta[k])) {
      const { data: updated, error: authErr } = await supabaseServer.auth.admin.updateUserById(user.id, {
        user_metadata: nextMeta,
      });
      if (authErr) {
        console.error('[profile-settings] updateUserById error:', authErr);
        return res.status(500).json({ error: authErr.message || 'Nepodařilo se uložit.' });
      }
    }

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
      user_metadata: nextMeta,
      ...(avatar_url !== undefined && { avatar_url }),
      ...(daily_email !== undefined && { daily_email }),
    });
  } catch (err) {
    console.error('[profile-settings] ERROR:', err);
    return res.status(500).json({ error: 'Chyba serveru' });
  }
}
