#!/usr/bin/env node
/**
 * Lokální spuštění ai_tasks (stejná DB jako .env.local) – obchází produkční scheduler timeout.
 *   node scripts/execute-ai-task-local.mjs <task_id>
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { executeAITask } from '../lib/taskExecutors.js';

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

const taskId = process.argv[2];
if (!taskId) {
  console.error('Usage: node scripts/execute-ai-task-local.mjs <task_id>');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  const { data: task, error } = await supabase
    .from('ai_tasks')
    .select('id, user_id, agent_slug, task_type, payload, status, attempts')
    .eq('id', taskId)
    .maybeSingle();

  if (error || !task) {
    console.error('Task nenalezen:', error?.message || taskId);
    process.exit(1);
  }

  console.log('Spouštím task', task.id, task.agent_slug, task.task_type, 'status:', task.status);

  await supabase
    .from('ai_tasks')
    .update({
      status: 'processing',
      processing_started_at: new Date().toISOString(),
      next_retry_at: null,
    })
    .eq('id', taskId);

  const result = await executeAITask(task);
  const ok = result?.ok !== false && result?.outcome_type;

  await supabase
    .from('ai_tasks')
    .update({
      status: ok ? 'completed' : 'failed',
      processing_started_at: null,
      result: result || null,
      last_error: ok ? null : result?.reason || result?.error || 'execute failed',
      completed_at: ok ? new Date().toISOString() : null,
    })
    .eq('id', taskId);

  console.log(JSON.stringify(result, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
