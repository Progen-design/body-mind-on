// /pages/api/workouts.js
import { supabaseServer } from '../../lib/supabaseServer';
import { requireActiveMembership } from '../../lib/membershipHelpers';

const WORKOUT_TYPE_LABELS = {
  silovy: 'Silový',
  kardio: 'Kardio',
  beh: 'Běh',
  kolo: 'Kolo',
  chuze: 'Chůze',
  plavani: 'Plavání',
  strečink: 'Strečink',
  joga: 'Jóga',
  nordic_walking: 'Nordic walking',
  brusleni: 'Bruslení',
  lyzovani: 'Lyžování',
  sauna: 'Sauna',
  ostatni: 'Ostatní',
};

function getAuthUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Authorization required', status: 401 };
  return { token };
}

async function requireUser(req) {
  const { token, error, status } = getAuthUser(req);
  if (error) return { error, status };
  const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
  if (userErr || !user) return { error: 'Invalid or expired token', status: 401 };
  return { user };
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userResult = await requireUser(req);
    if (userResult.error) {
      return res.status(userResult.status).json({ error: userResult.error });
    }
    const { user } = userResult;

    if (req.method === 'POST' || req.method === 'DELETE') {
      const membershipCheck = await requireActiveMembership(user.id);
      if (!membershipCheck.allowed) {
        return res.status(membershipCheck.status || 403).json({ error: membershipCheck.error });
      }
    }

    if (req.method === 'GET') {
      const { from, to, limit } = req.query;
      let query = supabaseServer
        .from('workouts')
        .select('*')
        .eq('user_id', user.id)
        .order('workout_date', { ascending: false });

      if (from) query = query.gte('workout_date', from);
      if (to) query = query.lte('workout_date', to);
      const lim = parseInt(limit, 10);
      if (Number.isFinite(lim) && lim > 0) query = query.limit(Math.min(lim, 500));

      const { data, error } = await query;
      if (error) {
        console.error('[workouts] GET error:', error);
        return res.status(500).json({ error: 'Failed to fetch workouts' });
      }
      return res.status(200).json({ workouts: data || [] });
    }

    if (req.method === 'POST') {
      const { workout_date, workout_type, duration_min, notes, perceived_difficulty } = req.body || {};
      if (!workout_date) {
        return res.status(400).json({ error: 'workout_date is required' });
      }
      const typeVal = workout_type != null ? String(workout_type).trim() : null;
      const validDifficulty = ['easy', 'just_right', 'hard', 'too_hard'].includes(perceived_difficulty)
        ? perceived_difficulty
        : null;
      const payload = {
        user_id: user.id,
        workout_date: String(workout_date).trim(),
        workout_type: typeVal,
        workout_name: typeVal ? (WORKOUT_TYPE_LABELS[typeVal] || typeVal) : 'Ostatní',
        duration_min: duration_min != null ? parseInt(duration_min, 10) : null,
        notes: notes != null ? String(notes).trim() : null,
        perceived_difficulty: validDifficulty,
      };
      if (Number.isNaN(payload.duration_min)) payload.duration_min = null;

      const { data, error } = await supabaseServer
        .from('workouts')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error('[workouts] POST error:', error);
        return res.status(500).json({ error: error.message || 'Failed to create workout' });
      }
      return res.status(201).json({ workout: data });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Workout id is required' });
      }
      const { data: existing, error: fetchErr } = await supabaseServer
        .from('workouts')
        .select('id, user_id')
        .eq('id', id)
        .single();

      if (fetchErr || !existing) {
        return res.status(404).json({ error: 'Workout not found' });
      }
      if (existing.user_id !== user.id) {
        return res.status(403).json({ error: 'Not authorized to delete this workout' });
      }

      const { error: deleteErr } = await supabaseServer
        .from('workouts')
        .delete()
        .eq('id', id);

      if (deleteErr) {
        console.error('[workouts] DELETE error:', deleteErr);
        return res.status(500).json({ error: 'Failed to delete workout' });
      }
      return res.status(200).json({ ok: true });
    }
  } catch (err) {
    console.error('[workouts] ERROR:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
