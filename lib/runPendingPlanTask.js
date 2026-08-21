/**
 * Spuštění čekající plánovací úlohy NA POŽÁDÁNÍ.
 *
 * PROČ. Úlohy z fronty zpracovává `runAIScheduler`, kterého žene GitHub Actions
 * zhruba jednou za hodinu. Pro registraci to nestačilo už dřív, a proto si
 * `api/body-metrics.js` claim + execute dělá samo hned po registraci.
 * Po zaplacení předplatného platí totéž: uživatel se vrací na /profil a čekat
 * hodinu na plán, za který právě zaplatil, je špatná odpověď.
 *
 * NEÚSPĚCH TU NESMÍ BÝT TERMINÁLNÍ. Kdyby se úloha při chybě zavřela jako
 * `failed`, scheduler by ji už nikdy nesebral (bere jen `pending`) a producent
 * by ji nezaložil znovu — idempotency klíč je stejný a UNIQUE ho odmítne jako
 * duplicitu. Jedna přechodná chyba (timeout Spoonacularu, výpadek DB) by tak
 * znamenala uživatele bez plánu natrvalo. Retry logika je proto stejná jako
 * v `lib/aiScheduler.js`: attempts+1, exponenciální `next_retry_at`, zpátky na
 * `pending`, a na `dlq` až po vyčerpání `AI_TASK_MAX_ATTEMPTS`.
 *
 * Claim je podmíněný (`.eq('status', 'pending')`), takže když úlohu mezitím
 * sebral scheduler, tahle cesta ji nepřevezme podruhé a vrátí `already_running`.
 */
import { getMaxTaskAttempts, getRetryBackoffMinutes } from './aiOps.js';
import { sanitizeErrorMessage } from './safeLog.js';

/**
 * Výchozí klient a vykonavatel se načítají líně, aby šel modul naimportovat
 * v holém Node (test s podvrženými závislostmi) — `taskExecutors.js` táhne
 * půl aplikace a `supabaseServer` potřebuje env.
 */
async function defaultClient() {
  const { supabaseServer } = await import('./supabaseServer.js');
  return supabaseServer;
}
async function defaultExecute(task) {
  const { executeAITask } = await import('./taskExecutors.js');
  return executeAITask(task);
}

/**
 * Převezme úlohu a spustí ji. Vrací výsledek, nezvedá výjimku.
 *
 * @param {{ id: string, attempts?: number }} taskRow
 * @param {{ client?: object, execute?: Function, maxAttempts?: number }} [deps]
 * @returns {Promise<{ ok: boolean, claimed: boolean, status: string, result: object|null, error: string|null }>}
 */
export async function claimAndExecutePlanTask(taskRow, deps = {}) {
  if (!taskRow?.id) {
    return { ok: false, claimed: false, status: 'missing_task', result: null, error: null };
  }
  const client = deps.client || await defaultClient();
  const execute = deps.execute || defaultExecute;
  const maxAttempts = deps.maxAttempts ?? getMaxTaskAttempts();

  const claimNow = new Date().toISOString();
  let claimRes = await client
    .from('ai_tasks')
    .update({ status: 'processing', processing_started_at: claimNow })
    .eq('id', taskRow.id)
    .eq('status', 'pending')
    .select('id, user_id, agent_slug, task_type, payload, attempts')
    .maybeSingle();

  // Starší schéma nemá `processing_started_at` — stejný ústup jako
  // v api/body-metrics.js.
  if (claimRes.error && /processing_started_at|does not exist|neexistuje/i.test(claimRes.error.message || '')) {
    claimRes = await client
      .from('ai_tasks')
      .update({ status: 'processing' })
      .eq('id', taskRow.id)
      .eq('status', 'pending')
      .select('id, user_id, agent_slug, task_type, payload, attempts')
      .maybeSingle();
  }

  const task = claimRes.data;
  // Nezískaný claim NENÍ chyba: úlohu právě zpracovává scheduler.
  if (!task?.id) {
    return { ok: false, claimed: false, status: 'already_running', result: null, error: claimRes.error?.message ?? null };
  }

  /** Vrátí úlohu do fronty, nebo ji po vyčerpání pokusů pošle do DLQ. */
  const vratDoFronty = async (duvod) => {
    const errMsg = sanitizeErrorMessage(duvod || 'permanent_failure');
    const nextAttempts = Number(task.attempts || taskRow.attempts || 0) + 1;
    const doDlq = nextAttempts >= maxAttempts;
    const retryAt = new Date(Date.now() + getRetryBackoffMinutes(nextAttempts) * 60 * 1000).toISOString();

    await client.from('ai_tasks').update(doDlq
      ? {
        status: 'dlq',
        attempts: nextAttempts,
        result: { error: errMsg, dlq: true },
        last_error: errMsg,
        next_retry_at: null,
        dead_lettered_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      }
      : {
        status: 'pending',
        attempts: nextAttempts,
        result: { error: errMsg, retry_scheduled_for: retryAt },
        last_error: errMsg,
        next_retry_at: retryAt,
        processed_at: null,
      }).eq('id', task.id);

    return {
      ok: false,
      claimed: true,
      status: doDlq ? 'dlq' : 'retry_scheduled',
      result: null,
      error: errMsg,
    };
  };

  let exec;
  try {
    exec = await execute(task);
  } catch (e) {
    return vratDoFronty(e?.message || String(e));
  }

  // „Hotovo bez plan_id“ je selhání, ne úspěch — plán, který nevznikl, se
  // nesmí tvářit jako doručený.
  const hasPlanId = exec?.result?.outcome_type === 'plan_generated'
    && exec?.result?.plan_id != null && exec?.result?.plan_id !== '';
  const ok = Boolean(exec?.ok) && (hasPlanId || exec?.result?.outcome_type !== 'plan_generated');

  if (!ok) {
    // Důvod se NESMÍ ztratit. Dřív se sem psalo `last_error: null`, takže
    // z databáze nešlo zjistit, proč plán nevznikl.
    return vratDoFronty(
      exec?.result?.error
      || exec?.error
      || (exec?.ok && !hasPlanId ? 'Completed without plan_id' : 'permanent_failure')
    );
  }

  await client.from('ai_tasks').update({
    status: 'completed',
    result: exec?.result ?? {},
    processed_at: new Date().toISOString(),
    last_error: null,
  }).eq('id', task.id);

  return { ok: true, claimed: true, status: 'completed', result: exec?.result ?? null, error: null };
}

/**
 * Najde a spustí čekající `weekly_plan_update` uživatele.
 *
 * KDYŽ ŽÁDNÁ NENÍ, ZALOŽÍ SI JI SÁM. Redirect ze Stripe checkoutu bývá
 * rychlejší než doručení webhooku, takže endpoint volaný hned po návratu na
 * profil úlohu často ještě nenajde a uživatel by čekal do rána na cron.
 * Dva zdroje téhož insertu jsou bezpečné z principu — idempotency klíč je
 * v databázi a UNIQUE druhý pokus odmítne. Přesně proto tam ten klíč je.
 *
 * @param {string} userId
 * @param {{ client?: object, execute?: Function, produce?: Function, maxAttempts?: number }} [deps]
 * @returns {Promise<{ ok: boolean, status: string, task_id: string|null, plan_id: string|null, produced: boolean, error: string|null }>}
 */
export async function runPendingWeeklyTaskForUser(userId, deps = {}) {
  if (!userId) {
    return { ok: false, status: 'missing_user_id', task_id: null, plan_id: null, produced: false, error: null };
  }
  const client = deps.client || await defaultClient();

  const najdiUlohu = async () => {
    const { data, error } = await client
      .from('ai_tasks')
      .select('id, status, attempts, created_at')
      .eq('user_id', userId)
      .eq('task_type', 'weekly_plan_update')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return { data, error };
  };

  let { data: task, error } = await najdiUlohu();
  if (error) {
    return { ok: false, status: 'query_error', task_id: null, plan_id: null, produced: false, error: error.message };
  }

  let produced = false;
  if (!task?.id) {
    const produce = deps.produce
      || (async (id) => {
        const { produceWeeklyTaskForUser } = await import('./weeklyPlanProducer.js');
        return produceWeeklyTaskForUser(id, { client });
      });

    const vyroba = await produce(userId);
    produced = Boolean(vyroba?.created);

    // `duplicate` znamená, že úlohu právě založil webhook — pak ji najdeme
    // v druhém pokusu. Zamítnutí bránou je konečné.
    if (!vyroba?.created && vyroba?.reason !== 'duplicate') {
      return {
        ok: false,
        status: vyroba?.reason || 'no_pending_task',
        task_id: null,
        plan_id: null,
        produced: false,
        error: null,
      };
    }

    ({ data: task, error } = await najdiUlohu());
    if (error) {
      return { ok: false, status: 'query_error', task_id: null, plan_id: null, produced, error: error.message };
    }
    if (!task?.id) {
      // Úloha existuje, ale není `pending` — bere ji scheduler.
      return { ok: false, status: 'already_running', task_id: null, plan_id: null, produced, error: null };
    }
  }

  const vysledek = await claimAndExecutePlanTask(task, deps);
  return {
    ok: vysledek.ok,
    status: vysledek.status,
    task_id: task.id,
    plan_id: vysledek.result?.plan_id ?? null,
    produced,
    error: vysledek.error,
  };
}
