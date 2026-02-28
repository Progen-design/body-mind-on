// GET /api/trainer/clients – seznam klientů (uživatelé s body_metrics, kromě trenéra). Pouze pro přihlášeného trenéra.
import { supabaseServer } from '../../../lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Neplatná session' });

    const trainerEmail = (process.env.TRAINER_EMAIL || '').toLowerCase().trim();
    const email = (user.email || '').toLowerCase();
    if (!trainerEmail || email !== trainerEmail) {
      return res.status(403).json({ error: 'Pouze trenér může zobrazit seznam klientů.' });
    }

    // Uživatelé s alespoň jednou body_metrics (klienti ze START)
    const { data: metricsRows, error: metricsErr } = await supabaseServer
      .from('body_metrics')
      .select('user_id, name, weight_kg, height_cm, program, created_at')
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false });

    if (metricsErr) {
      console.error('[trainer/clients] body_metrics:', metricsErr);
      return res.status(500).json({ error: 'Nepodařilo se načíst data', clients: [] });
    }

    const latestByUser = {};
    (metricsRows || []).forEach((row) => {
      const uid = row.user_id;
      if (!uid || latestByUser[uid]) return;
      latestByUser[uid] = {
        name: row.name,
        weight_kg: row.weight_kg != null ? Number(row.weight_kg) : null,
        height_cm: row.height_cm != null ? Number(row.height_cm) : null,
        program: row.program || 'START',
        created_at: row.created_at,
      };
    });
    const clientUserIds = Object.keys(latestByUser);

    if (clientUserIds.length === 0) {
      return res.status(200).json({ clients: [] });
    }

    // Workout statistiky per user
    const { data: workoutsRows, error: workoutsErr } = await supabaseServer
      .from('workouts')
      .select('user_id, workout_date')
      .in('user_id', clientUserIds)
      .order('workout_date', { ascending: false });

    const workoutStats = {};
    (workoutsRows || []).forEach((row) => {
      const uid = row.user_id;
      if (!uid) return;
      if (!workoutStats[uid]) workoutStats[uid] = { count: 0, lastDate: null };
      workoutStats[uid].count += 1;
      if (!workoutStats[uid].lastDate && row.workout_date) {
        workoutStats[uid].lastDate = String(row.workout_date).slice(0, 10);
      }
    });

    // Auth uživatelé – jen ti, kteří jsou v clientUserIds a nejsou trenér
    const { data: { users: authUsers }, error: listErr } = await supabaseServer.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) {
      console.error('[trainer/clients] listUsers:', listErr);
      return res.status(500).json({ error: 'Nepodařilo se načíst uživatele', clients: [] });
    }

    const clients = [];
    (authUsers || []).forEach((u) => {
      if (!clientUserIds.includes(u.id)) return;
      const uEmail = (u.email || '').toLowerCase();
      if (uEmail === trainerEmail) return;
      const meta = u.user_metadata || {};
      const latest = latestByUser[u.id] || {};
      const stats = workoutStats[u.id] || { count: 0, lastDate: null };
      clients.push({
        id: u.id,
        email: u.email,
        name: latest.name || meta.name || u.email?.split('@')[0] || '—',
        program: latest.program || 'START',
        weight_kg: latest.weight_kg,
        height_cm: latest.height_cm,
        goal_weight_kg: meta.goal_weight_kg != null ? Number(meta.goal_weight_kg) : null,
        registered_at: latest.created_at || u.created_at,
        workout_count: stats.count,
        last_workout_date: stats.lastDate,
      });
    });

    // Seřadit podle jména (nebo data registrace)
    clients.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'cs'));

    return res.status(200).json({ clients });
  } catch (err) {
    console.error('[trainer/clients]', err);
    return res.status(500).json({ error: 'Chyba serveru', clients: [] });
  }
}
