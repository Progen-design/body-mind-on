// /pages/api/user-habits.js – výběr návyků uživatele
import { supabaseServer } from '../../lib/supabaseServer';
import { isValidHabitId, POSITIVE_HABITS, NEGATIVE_HABITS } from '../../lib/habits';

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
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userResult = await requireUser(req);
    if (userResult.error) {
      return res.status(userResult.status).json({ error: userResult.error });
    }
    const { user } = userResult;

    if (req.method === 'GET') {
      const { data, error } = await supabaseServer
        .from('user_habits')
        .select('*')
        .eq('user_id', user.id)
        .order('is_positive', { ascending: false })
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('[user-habits] GET error:', error);
        return res.status(500).json({ error: 'Failed to fetch user habits' });
      }
      return res.status(200).json({ habits: data || [] });
    }

    if (req.method === 'POST') {
      const { habits } = req.body || {};
      if (!Array.isArray(habits)) {
        return res.status(400).json({ error: 'habits must be an array' });
      }

      const valid = habits
        .filter((h) => h && typeof h.habit_id === 'string' && isValidHabitId(h.habit_id.trim()))
        .map((h, i) => ({
          user_id: user.id,
          habit_id: String(h.habit_id).trim(),
          is_positive: POSITIVE_HABITS.some((p) => p.id === h.habit_id.trim()),
          sort_order: i,
        }));

      const { error: delErr } = await supabaseServer
        .from('user_habits')
        .delete()
        .eq('user_id', user.id);

      if (delErr) {
        console.warn('[user-habits] Delete existing:', delErr.message);
      }

      if (valid.length === 0) {
        return res.status(200).json({ habits: [], ok: true });
      }

      const { data, error } = await supabaseServer
        .from('user_habits')
        .insert(valid)
        .select();

      if (error) {
        console.error('[user-habits] POST error:', error);
        return res.status(500).json({ error: error.message || 'Failed to save habits' });
      }
      return res.status(200).json({ habits: data || [], ok: true });
    }
  } catch (err) {
    console.error('[user-habits] ERROR:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
