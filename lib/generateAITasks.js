/**
 * Registrační ai_tasks. Týdenní smyčka tady UŽ NENÍ.
 *
 * Funkce generateAITasks() byla od 2. 6. 2026 zamrzlá (hard return) po incidentu,
 * kdy smyčka missing_plan + 5min cron spálila 7 405 Spoonacular volání s nulovou
 * úspěšností. Odstraněna 2. 8. 2026 a nahrazena lib/weeklyPlanProducer.js.
 *
 * Nerozmrazovala se schválně: měla nefixnutý missing_days_structure bug a hlavně
 * neměla zábranu proti duplicitám nikde jinde než v kódu. Náhrada má idempotenci
 * v databázi (UNIQUE + CHECK) a běží jednou denně. Zamrzlá funkce s komentářem
 * „stačí odstranit return“ je pozvánka — dokud existuje, jednou ji někdo odmrazí.
 */
import { supabaseServer } from './supabaseServer';

/**
 * Create initial AI tasks for a newly registered user (after body_metrics insert).
 * Inserts ONE trainer initial_plan and ONE coach onboarding_message.
 * No retries, no duplicates - simple and clean.
 */
export async function createInitialAITasks(userId) {
      if (!userId) return { created: 0 };

  try {
          // Check if user already has initial_plan task (avoid duplicates)
        const { data: existing } = await supabaseServer
            .from('ai_tasks')
            .select('id')
            .eq('user_id', userId)
            .eq('task_type', 'initial_plan')
            .in('status', ['pending', 'processing', 'completed'])
            .limit(1)
            .maybeSingle();

        if (existing) {
                  console.info('[generateAITasks] initial_plan already exists, skipping', { userId });
                  return { created: 0, reason: 'already_exists' };
        }

        const inserts = [
            {
                        user_id: userId,
                        agent_slug: 'trainer',
                        task_type: 'initial_plan',
                        payload: { prompt: 'Vygeneruj uvodni tydenni plan na zaklade kontextu uzivatele.' },
                        status: 'pending',
            },
            {
                        user_id: userId,
                        agent_slug: 'coach',
                        task_type: 'onboarding_message',
                        payload: { prompt: 'Posli uvitaci / onboarding zpravu na zaklade kontextu uzivatele.' },
                        status: 'pending',
            },
                ];

        const { data, error } = await supabaseServer
            .from('ai_tasks')
            .insert(inserts)
            .select('id');

        if (error) {
                  console.error('[generateAITasks] createInitialAITasks insert failed', error);
                  return { created: 0, error: error.message };
        }

        console.info('[generateAITasks] createInitialAITasks created', {
                  userId,
                  count: data?.length || 0,
        });
          return { created: data?.length || 0 };
  } catch (err) {
          console.error('[generateAITasks] createInitialAITasks error', err);
          return { created: 0, error: String(err) };
  }
}
