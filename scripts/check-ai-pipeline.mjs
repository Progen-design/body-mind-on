/**
 * scripts/check-ai-pipeline.mjs
 * Read-only health check for the AI task/event pipeline.
 *
 * Usage:
 *   node scripts/check-ai-pipeline.mjs <SUPABASE_PAT>
 *
 * What it checks:
 *   - Recent task status breakdown (completed/failed/pending/dlq)
 *   - Recent event status breakdown
 *   - Tasks stuck in processing
 *   - DLQ count
 *   - Plan generation success rate (last 7 days)
 *   - Coach message success rate (last 7 days)
 *   - ai_messages schema completeness
 *   - shared memory facts present
 */
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const PROJECT_REF = 'ipfyavvmmxmsjupmfnes';
const pat = process.argv[2];

if (!pat) {
  console.error('Usage: node scripts/check-ai-pipeline.mjs <SUPABASE_PAT>');
  console.error('Get PAT at: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

function runQuery(pat, projectRef, query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '[]');
          resolve(parsed);
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function printSection(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

function formatRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('  (no data)');
    return;
  }
  for (const row of rows) {
    const parts = Object.entries(row).map(([k, v]) => `${k}=${v}`);
    console.log(' ', parts.join('  |  '));
  }
}

async function run() {
  console.log('\n🔍 Body & Mind ON — AI Pipeline Health Check');
  console.log(`🔗 Project: ${PROJECT_REF}`);
  console.log(`⏰ Time: ${new Date().toISOString()}`);

  // 1. Task status breakdown (last 24h)
  printSection('AI Tasks — Last 24h');
  const taskStatus = await runQuery(pat, PROJECT_REF, `
    select status, count(*) as count
    from ai_tasks
    where created_at > now() - interval '24 hours'
    group by status order by status;
  `);
  formatRows(taskStatus);

  // 2. Tasks stuck in processing
  printSection('Stuck Processing Tasks (> 15 min)');
  const stuckTasks = await runQuery(pat, PROJECT_REF, `
    select id, agent_slug, task_type, attempts, processing_started_at
    from ai_tasks
    where status = 'processing'
      and processing_started_at < now() - interval '15 minutes'
    limit 10;
  `);
  if (!stuckTasks.length) {
    console.log('  ✅ No stuck tasks');
  } else {
    console.log(`  ⚠️  ${stuckTasks.length} stuck task(s):`);
    formatRows(stuckTasks);
  }

  // 3. DLQ counts
  printSection('Dead Letter Queue');
  const dlq = await runQuery(pat, PROJECT_REF, `
    select 'tasks' as type, count(*) as count from ai_tasks where status = 'dlq'
    union all
    select 'events', count(*) from ai_events where status = 'dlq';
  `);
  for (const row of dlq) {
    const icon = Number(row.count) > 0 ? '⚠️ ' : '✅';
    console.log(`  ${icon} ${row.type}: ${row.count} DLQ`);
  }

  // 4. Plan generation success rate
  printSection('Plan Generation Success Rate (7 days)');
  const planRate = await runQuery(pat, PROJECT_REF, `
    select
      count(*) filter (where status = 'completed') as completed,
      count(*) filter (where status = 'failed') as failed,
      count(*) filter (where status = 'pending') as pending,
      round(count(*) filter (where status = 'completed') * 100.0 / nullif(count(*), 0), 1) as success_pct
    from ai_tasks
    where agent_slug = 'trainer'
      and created_at > now() - interval '7 days';
  `);
  formatRows(planRate);

  // 5. Coach message success rate
  printSection('Coach Message Success Rate (7 days)');
  const coachRate = await runQuery(pat, PROJECT_REF, `
    select
      count(*) filter (where status = 'completed') as completed,
      count(*) filter (where status = 'failed') as failed,
      round(count(*) filter (where status = 'completed') * 100.0 / nullif(count(*), 0), 1) as success_pct
    from ai_tasks
    where agent_slug = 'coach'
      and created_at > now() - interval '7 days';
  `);
  formatRows(coachRate);

  // 6. ai_messages schema check
  printSection('ai_messages Schema Check');
  const schemaCheck = await runQuery(pat, PROJECT_REF, `
    select column_name
    from information_schema.columns
    where table_name = 'ai_messages'
      and column_name in ('task_id', 'payload', 'user_id', 'agent_slug', 'task_type', 'content')
    order by column_name;
  `);
  const expectedCols = ['agent_slug', 'content', 'payload', 'task_id', 'task_type', 'user_id'];
  const foundCols = schemaCheck.map((r) => r.column_name);
  for (const col of expectedCols) {
    const found = foundCols.includes(col);
    console.log(`  ${found ? '✅' : '❌'} ai_messages.${col}`);
  }

  // 7. ai_messages without task_id (provenance check)
  printSection('ai_messages Without task_id (last 24h)');
  const missingTaskId = await runQuery(pat, PROJECT_REF, `
    select count(*) as count
    from ai_messages
    where task_id is null
      and created_at > now() - interval '24 hours';
  `);
  const c = Number(missingTaskId[0]?.count ?? 0);
  console.log(`  ${c === 0 ? '✅' : '⚠️ '} ${c} message(s) without task_id`);

  // 8. Shared memory facts
  printSection('Shared Memory Facts (all users)');
  const sharedFacts = await runQuery(pat, PROJECT_REF, `
    select memory_type, count(*) as count, max(created_at) as latest
    from user_ai_memory
    where memory_type like 'shared_%'
    group by memory_type
    order by memory_type;
  `);
  if (sharedFacts.length === 0) {
    console.log('  (no shared facts yet — expected if no coach tasks have run)');
  } else {
    formatRows(sharedFacts);
  }

  // 9. Recent plans count
  printSection('Plans Generated (last 7 days)');
  const recentPlans = await runQuery(pat, PROJECT_REF, `
    select count(*) as total_plans,
      count(*) filter (where is_active = true) as active_plans
    from ai_generated_plans
    where created_at > now() - interval '7 days';
  `);
  formatRows(recentPlans);

  // 10. Email success
  printSection('Email Delivery (initial_plan, last 7 days)');
  const emailStats = await runQuery(pat, PROJECT_REF, `
    select
      count(*) filter (where result->>'email_sent' = 'true') as sent,
      count(*) filter (where result->>'email_sent' = 'false') as failed
    from ai_tasks
    where agent_slug = 'trainer'
      and task_type = 'initial_plan'
      and created_at > now() - interval '7 days';
  `);
  formatRows(emailStats);

  console.log('\n✅ Pipeline check complete.\n');
}

run().catch((err) => {
  console.error('❌ Check failed:', err.message);
  process.exit(1);
});
