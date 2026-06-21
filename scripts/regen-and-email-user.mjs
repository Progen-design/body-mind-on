#!/usr/bin/env node
/**
 * Přegeneruje initial_plan pro uživatele na produkci a počká na dokončení (+ e-mail z tasku).
 *   node scripts/regen-and-email-user.mjs janprikopa@gmail.com
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  fetchWithTimeout,
  FETCH_TIMEOUT,
  formatFetchError,
} from './lib/fetchWithTimeout.mjs';

const email = (process.argv[2] || 'janprikopa@gmail.com').trim().toLowerCase();
const APP_URL = (process.env.TEST_APP_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] === undefined) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  break;
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET || process.env.AI_SCHEDULER_SECRET;

if (!supabaseUrl || !serviceKey || !cronSecret) {
  console.error('Chybí SUPABASE_* nebo CRON_SECRET');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function findUserId(targetEmail) {
  const { data: prof } = await supabase.from('profiles').select('id').eq('email', targetEmail).maybeSingle();
  if (prof?.id) return prof.id;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users || []).find((u) => (u.email || '').toLowerCase() === targetEmail);
    if (hit?.id) return hit.id;
    if ((data?.users || []).length < 200) break;
  }
  return null;
}

async function runScheduler() {
  const url = `${APP_URL}/api/ai/run-scheduler`;
  let res;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${cronSecret}` },
      },
      FETCH_TIMEOUT.SCHEDULER
    );
  } catch (err) {
    throw new Error(formatFetchError(err, url));
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Scheduler ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

async function main() {
  const userId = await findUserId(email);
  if (!userId) {
    console.error('Uživatel nenalezen:', email);
    process.exit(1);
  }
  console.log('User:', userId, email);

  const taskKey = `manual-regen:${userId}:${Date.now()}`;
  const { data: inserted, error: insErr } = await supabase
    .from('ai_tasks')
    .insert({
      user_id: userId,
      agent_slug: 'trainer',
      task_type: 'initial_plan',
      idempotency_key: taskKey,
      payload: {
        prompt: 'Přegeneruj plán s plnými 60min tréninky (manuální po deployi).',
        force_regenerate: true,
        emailOptions: {
          loginPassword: null,
          loginUrl: `${APP_URL}/login`,
          existingAccount: true,
          loginUnavailable: false,
          userChosePassword: true,
        },
      },
      status: 'pending',
    })
    .select('id')
    .maybeSingle();

  if (insErr) {
    console.error('Insert task failed:', insErr.message);
    process.exit(1);
  }
  const taskId = inserted.id;
  console.log('Task created:', taskId);

  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const { data: task } = await supabase.from('ai_tasks').select('status, result, last_error').eq('id', taskId).maybeSingle();
    if (task?.status === 'completed') {
      console.log('Task completed:', {
        plan_id: task.result?.plan_id,
        email_sent: task.result?.email_sent,
        summary: task.result?.summary,
      });
      const { data: plan } = await supabase
        .from('ai_generated_plans')
        .select('id, email_sent, valid_from')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      console.log('Latest plan:', plan);
      const { data: daySample } = await supabase
        .from('ai_generated_plans')
        .select('structured_plan_json')
        .eq('id', plan?.id)
        .maybeSingle();
      const days = daySample?.structured_plan_json?.days || [];
      for (const d of days) {
        if (!d?.workout?.exercises?.length) continue;
        console.log(
          `  ${d.day_name}: ${d.workout.exercises.length} cviků, ~${d.workout.duration_minutes} min`,
          d.workout.exercises.map((e) => e.display_name_cs || e.name_cs || e.name).slice(0, 6).join(', ')
        );
      }
      if (task.result?.email_sent !== true) {
        console.warn('E-mail z tasku neodešel – spouštím admin send…');
        process.exit(2);
      }
      console.log('Hotovo – plán přegenerován a e-mail odeslán na', email);
      return;
    }
    if (task?.status === 'failed' || task?.status === 'dlq') {
      console.error('Task failed:', task?.last_error, task?.result);
      process.exit(1);
    }
    console.log('Scheduler… status:', task?.status || 'unknown');
    await runScheduler();
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.error('Timeout – task nedokončen');
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
