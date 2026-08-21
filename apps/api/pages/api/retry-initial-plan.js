/**
 * POST /api/retry-initial-plan
 * Vytvoří nebo znovu spustí úlohu initial_plan pro přihlášeného uživatele.
 * Používá se když plán nebyl vytvořen (missing) nebo selhal (failed).
 */
import { supabaseServer } from '../../lib/supabaseServer';
import { createInitialAITasks } from '../../lib/createInitialAITasks';
import { executeAITask } from '../../lib/taskExecutors';
import { runAIScheduler } from '../../lib/aiScheduler';
import { requireActiveMembership } from '../../lib/membershipHelpers';
import { getDefaultLoginUrl } from '../../lib/siteUrls.js';

const loginUrl = getDefaultLoginUrl();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Pouze POST' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Neplatná session' });

    const userId = user.id;
    const email = user.email?.toLowerCase();
    if (!email) return res.status(400).json({ error: 'Uživatel nemá e-mail' });

    const membershipCheck = await requireActiveMembership(userId);
    if (!membershipCheck.allowed) {
      return res.status(membershipCheck.status || 403).json({ error: membershipCheck.error });
    }

    // Načíst body_metrics pro emailOptions
    const { data: bm } = await supabaseServer
      .from('body_metrics')
      .select('email')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const emailOptions = {
      loginPassword: null,
      loginUrl,
      existingAccount: true,
      loginUnavailable: false,
      userChosePassword: true,
    };

    // 1. Zkontrolovat existující task
    const { data: existingTask } = await supabaseServer
      .from('ai_tasks')
      .select('id, status, result')
      .eq('user_id', userId)
      .eq('agent_slug', 'trainer')
      .eq('task_type', 'initial_plan')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let taskToRun = null;

    if (existingTask?.status === 'pending') {
      // Task už čeká – spustit scheduler nebo přímo execute
      const { data: pendingTask } = await supabaseServer
        .from('ai_tasks')
        .select('id, user_id, agent_slug, task_type, payload')
        .eq('id', existingTask.id)
        .eq('status', 'pending')
        .maybeSingle();
      taskToRun = pendingTask;
    } else if (
      existingTask?.status === 'failed' ||
      existingTask?.status === 'dlq' ||
      existingTask?.status === 'completed' ||
      !existingTask
    ) {
      if (!existingTask) {
        try {
          await createInitialAITasks(userId, emailOptions);
        } catch (e) {
          if (!/duplicate|unique|already/i.test(e?.message || '')) {
            console.warn('[retry-initial-plan] createInitialAITasks:', e?.message);
          }
        }
      } else if (existingTask.status === 'completed') {
        const regenKey = `regen:${userId}:trainer:initial_plan:${Date.now()}`;
        const { error: insertErr } = await supabaseServer.from('ai_tasks').insert({
          user_id: userId,
          agent_slug: 'trainer',
          task_type: 'initial_plan',
          idempotency_key: regenKey,
          payload: {
            prompt: 'Přegeneruj personalizovaný plán (uživatel žádá nový plán se stejnými metrikami).',
            emailOptions,
            force_regenerate: true,
          },
          status: 'pending',
        });
        if (insertErr && !/duplicate|unique/i.test(insertErr.message || '')) {
          console.error('[retry-initial-plan] regen insert failed:', insertErr.message);
          return res.status(500).json({ error: 'Nepodařilo vytvořit úlohu přegenerování: ' + insertErr.message });
        }
      } else {
        const retryKey = `retry:${userId}:trainer:initial_plan:${Date.now()}`;
        const { error: insertErr } = await supabaseServer.from('ai_tasks').insert({
          user_id: userId,
          agent_slug: 'trainer',
          task_type: 'initial_plan',
          idempotency_key: retryKey,
          payload: {
            prompt: 'Vygeneruj první personalizovaný plán pro uživatele (retry).',
            emailOptions,
          },
          status: 'pending',
        });
        if (insertErr && !/duplicate|unique/i.test(insertErr.message || '')) {
          console.error('[retry-initial-plan] insert failed:', insertErr.message);
          return res.status(500).json({ error: 'Nepodařilo vytvořit úlohu: ' + insertErr.message });
        }
      }
      const { data: newTask } = await supabaseServer
        .from('ai_tasks')
        .select('id, user_id, agent_slug, task_type, payload')
        .eq('user_id', userId)
        .eq('agent_slug', 'trainer')
        .eq('task_type', 'initial_plan')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      taskToRun = newTask;
    }

    if (!taskToRun?.id) {
      return res.status(200).json({
        ok: true,
        message: 'Úloha již běží nebo byla právě vytvořena. Obnov stránku za chvíli.',
        plan_pending: true,
      });
    }

    // 2. Spustit execute přímo (priorita pro rychlou odpověď)
    try {
      const exec = await executeAITask(taskToRun);
      await supabaseServer
        .from('ai_tasks')
        .update({
          status: exec?.ok ? 'completed' : 'failed',
          result: exec?.result ?? { error: 'No result' },
          processed_at: new Date().toISOString(),
        })
        .eq('id', taskToRun.id);

      if (exec?.ok) {
        // executeTrainerTask umi vratit ok:true a pritom plan NEPREGENEROVAT —
        // kdyz uz existuje pouzitelny a neni force_regenerate, vraci
        // skip_reason 'skipped_existing_valid_plan'. Hlasit v takovem pripade
        // "Plán byl vygenerován" je lez, kterou uzivatel odhali tim, ze kouka
        // na stary plan. Odpoved proto rozlisuje oba pripady a vraci
        // updated_at, aby sla cerstvost overit i zvenku.
        const preskoceno = exec?.result?.skipped === true;
        const planId = exec?.result?.plan_id ?? null;
        let updatedAt = null;
        if (planId) {
          const { data: planRow } = await supabaseServer
            .from('ai_generated_plans')
            .select('updated_at')
            .eq('id', planId)
            .maybeSingle();
          updatedAt = planRow?.updated_at ?? null;
        }

        if (preskoceno) {
          return res.status(200).json({
            ok: true,
            message: 'Plán už je aktuální, nový se negeneroval.',
            plan_created: false,
            skipped: true,
            skip_reason: exec?.result?.skip_reason ?? null,
            plan_id: planId,
            plan_updated_at: updatedAt,
          });
        }

        return res.status(200).json({
          ok: true,
          message: 'Plán byl vygenerován. Obnov stránku.',
          plan_created: true,
          plan_id: planId,
          plan_updated_at: updatedAt,
          email_sent: exec?.result?.email_sent === true,
        });
      }
    } catch (execErr) {
      console.warn('[retry-initial-plan] execute failed:', execErr?.message);
      await supabaseServer
        .from('ai_tasks')
        .update({
          status: 'pending',
          last_error: execErr?.message,
          processed_at: null,
        })
        .eq('id', taskToRun.id);
      // Spustit scheduler – možná jiné tasky nebo retry
      try {
        await runAIScheduler();
      } catch (_) {}
      return res.status(200).json({
        ok: true,
        message: 'Generování probíhá na pozadí. Obnov stránku za minutu.',
        plan_pending: true,
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Plán se nepodařilo vygenerovat. Zkus to znovu nebo kontaktuj podporu.',
      plan_pending: false,
    });
  } catch (err) {
    console.error('[retry-initial-plan]', err);
    return res.status(500).json({ error: err?.message || 'Chyba serveru' });
  }
}
