// /pages/api/habits.js
import { supabaseServer } from '../../lib/supabaseServer';
import { requireActiveMembership } from '../../lib/membershipHelpers';
import { isValidHabitId } from '../../lib/habits';

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
      const { from, to, habit_ids } = req.query;
      let query = supabaseServer
        .from('habit_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('log_date', { ascending: false });

      if (from) query = query.gte('log_date', from);
      if (to) query = query.lte('log_date', to);
      if (habit_ids) {
        const ids = String(habit_ids).split(',').map((s) => s.trim()).filter(Boolean);
        if (ids.length > 0) query = query.in('habit_id', ids);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[habits] GET error:', error);
        return res.status(500).json({ error: 'Failed to fetch habit logs' });
      }
      return res.status(200).json({ logs: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const batch = Array.isArray(body.batch) ? body.batch : null;

      if (batch && batch.length > 0) {
        const logs = [];
        const max = 24;
        for (let i = 0; i < Math.min(batch.length, max); i++) {
          const row = batch[i] || {};
          const log_date = row.log_date;
          const habit_id = row.habit_id;
          if (!log_date || !habit_id) {
            return res.status(400).json({ error: 'batch[].log_date and batch[].habit_id are required' });
          }
          if (!isValidHabitId(habit_id)) {
            return res.status(400).json({ error: `Invalid habit_id: ${habit_id}` });
          }
          const payload = {
            user_id: user.id,
            log_date: String(log_date).trim().slice(0, 10),
            habit_id: String(habit_id).trim(),
            completed: row.completed !== false,
            notes: row.notes != null ? String(row.notes).trim() : null,
          };
          const { data, error } = await supabaseServer
            .from('habit_logs')
            .upsert(payload, {
              onConflict: 'user_id,log_date,habit_id',
              ignoreDuplicates: false,
            })
            .select()
            .single();
          if (error) {
            console.error('[habits] POST batch error:', error);
            return res.status(500).json({ error: error.message || 'Failed to save habit log batch' });
          }
          if (data) logs.push(data);
        }
        return res.status(200).json({ logs, batch: true });
      }

      const { log_date, habit_id, completed, notes } = body;
      if (!log_date || !habit_id) {
        return res.status(400).json({ error: 'log_date and habit_id are required' });
      }
      if (!isValidHabitId(habit_id)) {
        return res.status(400).json({ error: 'Invalid habit_id' });
      }

      const payload = {
        user_id: user.id,
        log_date: String(log_date).trim().slice(0, 10),
        habit_id: String(habit_id).trim(),
        completed: completed !== false,
        notes: notes != null ? String(notes).trim() : null,
      };

      const { data, error } = await supabaseServer
        .from('habit_logs')
        .upsert(payload, {
          onConflict: 'user_id,log_date,habit_id',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        console.error('[habits] POST error:', error);
        return res.status(500).json({ error: error.message || 'Failed to save habit log' });
      }
      return res.status(200).json({ log: data });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Habit log id is required' });
      }
      const { data: existing, error: fetchErr } = await supabaseServer
        .from('habit_logs')
        .select('id, user_id')
        .eq('id', id)
        .single();

      if (fetchErr || !existing) {
        return res.status(404).json({ error: 'Habit log not found' });
      }
      if (existing.user_id !== user.id) {
        return res.status(403).json({ error: 'Not authorized to delete this log' });
      }

      const { error: deleteErr } = await supabaseServer
        .from('habit_logs')
        .delete()
        .eq('id', id);

      if (deleteErr) {
        console.error('[habits] DELETE error:', deleteErr);
        return res.status(500).json({ error: 'Failed to delete habit log' });
      }
      return res.status(200).json({ ok: true });
    }
  } catch (err) {
    console.error('[habits] ERROR:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
