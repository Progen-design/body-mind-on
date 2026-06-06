#!/usr/bin/env node
/** Poll local/prod scheduler until task completes. */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const taskId = process.argv[2];
const appUrl = (process.env.TEST_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

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

const cronSecret = process.env.CRON_SECRET || process.env.AI_SCHEDULER_SECRET;
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runScheduler() {
  const res = await fetch(`${appUrl}/api/ai/run-scheduler`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cronSecret}` },
    signal: AbortSignal.timeout(300000),
  });
  const json = await res.json().catch(() => ({}));
  console.log('scheduler', res.status, JSON.stringify(json).slice(0, 300));
  return json;
}

async function main() {
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    const { data: task } = await supabase
      .from('ai_tasks')
      .select('status, result, last_error')
      .eq('id', taskId)
      .maybeSingle();
    console.log('task', task?.status, task?.last_error || '');
    if (task?.status === 'completed') {
      console.log(JSON.stringify(task.result, null, 2));
      return;
    }
    if (task?.status === 'failed' || task?.status === 'dlq') {
      console.error('failed', task?.last_error);
      process.exit(1);
    }
    await runScheduler();
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.error('timeout');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
