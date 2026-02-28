// GET /api/trainer/clients – seznam klientů (uživatelé s body_metrics, kromě trenéra). Pouze pro přihlášeného trenéra.
import { supabaseServer } from '../../../lib/supabaseServer';
import { POSITIVE_HABITS, NEGATIVE_HABITS } from '../../../lib/habits';

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

    // Workout statistiky a poslední trénink (celý záznam) per user
    const { data: workoutsRows, error: workoutsErr } = await supabaseServer
      .from('workouts')
      .select('user_id, workout_date, workout_type, workout_name, duration_min, notes')
      .in('user_id', clientUserIds)
      .order('workout_date', { ascending: false });

    const workoutStats = {};
    const lastWorkoutByUser = {};
    (workoutsRows || []).forEach((row) => {
      const uid = row.user_id;
      if (!uid) return;
      if (!workoutStats[uid]) workoutStats[uid] = { count: 0, lastDate: null };
      workoutStats[uid].count += 1;
      if (!workoutStats[uid].lastDate && row.workout_date) {
        workoutStats[uid].lastDate = String(row.workout_date).slice(0, 10);
      }
      if (!lastWorkoutByUser[uid] && row.workout_date) {
        lastWorkoutByUser[uid] = {
          workout_date: String(row.workout_date).slice(0, 10),
          workout_type: row.workout_type,
          workout_name: row.workout_name,
          duration_min: row.duration_min,
          notes: row.notes,
        };
      }
    });

    // Týden (Po–Ne) pro habit summary – stejná logika jako v profile
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const positiveIds = new Set(POSITIVE_HABITS.map((h) => h.id));
    const negativeIds = new Set(NEGATIVE_HABITS.map((h) => h.id));

    // user_habits per client
    const { data: userHabitsRows } = await supabaseServer
      .from('user_habits')
      .select('user_id, habit_id')
      .in('user_id', clientUserIds);
    const userHabitsByUserId = {};
    (userHabitsRows || []).forEach((row) => {
      if (!row.user_id) return;
      if (!userHabitsByUserId[row.user_id]) userHabitsByUserId[row.user_id] = [];
      userHabitsByUserId[row.user_id].push({ habit_id: row.habit_id });
    });

    // habit_logs pro tento týden (všechny klienty)
    const { data: habitLogsRows } = await supabaseServer
      .from('habit_logs')
      .select('user_id, log_date, habit_id, completed')
      .in('user_id', clientUserIds)
      .gte('log_date', weekStartStr)
      .lte('log_date', weekEndStr);

    const habitSummaryByUserId = {};
    (habitLogsRows || []).forEach((log) => {
      if (log.completed !== true) return;
      const uid = log.user_id;
      if (!uid) return;
      if (!habitSummaryByUserId[uid]) habitSummaryByUserId[uid] = { positiveDone: 0, negativeDone: 0, byHabit: {} };
      if (positiveIds.has(log.habit_id)) {
        habitSummaryByUserId[uid].positiveDone += 1;
        habitSummaryByUserId[uid].byHabit[log.habit_id] = (habitSummaryByUserId[uid].byHabit[log.habit_id] || 0) + 1;
      } else if (negativeIds.has(log.habit_id)) {
        habitSummaryByUserId[uid].negativeDone += 1;
        habitSummaryByUserId[uid].byHabit[log.habit_id] = (habitSummaryByUserId[uid].byHabit[log.habit_id] || 0) + 1;
      }
    });

    // Posledních 10 tréninků per user (pro celou kartu)
    const lastWorkoutsByUserId = {};
    (workoutsRows || []).forEach((row) => {
      const uid = row.user_id;
      if (!uid) return;
      if (!lastWorkoutsByUserId[uid]) lastWorkoutsByUserId[uid] = [];
      if (lastWorkoutsByUserId[uid].length < 10) {
        lastWorkoutsByUserId[uid].push({
          workout_date: String(row.workout_date).slice(0, 10),
          workout_type: row.workout_type,
          workout_name: row.workout_name,
          duration_min: row.duration_min,
          notes: row.notes,
        });
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
      const habitSummary = habitSummaryByUserId[u.id] || { positiveDone: 0, negativeDone: 0, byHabit: {} };
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
        last_workout: lastWorkoutByUser[u.id] || null,
        last_workouts: lastWorkoutsByUserId[u.id] || [],
        user_habits: userHabitsByUserId[u.id] || [],
        habit_summary_7d: habitSummary,
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
