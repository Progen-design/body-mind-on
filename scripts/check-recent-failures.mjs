/**
 * scripts/check-recent-failures.mjs
 * Read-only inspection of recent failures across all AI pipeline components.
 *
 * Usage:
 *   node scripts/check-recent-failures.mjs <SUPABASE_PAT> [hours=24]
 *
 * What it checks:
 *   - Failed and DLQ ai_tasks with error details
 *   - Failed and DLQ ai_events with error details
 *   - ai_logs error entries
 *   - Coach messages missing task_id (provenance gap)
 *   - Email delivery failures
 *   - Architecturally specific failure modes
 */
import https from 'https';

const PROJECT_REF = 'ipfyavvmmxmsjupmfnes';
const pat = process.argv[2];
const HOURS = parseInt(process.argv[3] || '24', 10);

if (!pat) {
  console.error('Usage: node scripts/check-recent-failures.mjs <SUPABASE_PAT> [hours=24]');
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
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data || '[]')); } catch { resolve([]); } });
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

function formatRows(rows, maxRows = 20) {
  if (!Array.isArray(rows) || rows.length === 0) { console.log('  ✅ None'); return; }
  for (const row of rows.slice(0, maxRows)) {
    const parts = [];
    for (const [k, v] of Object.entries(row)) {
      const val = typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v ?? '').slice(0, 80);
      parts.push(`${k}=${val}`);
    }
    console.log(' ', parts.join('  |  '));
  }
  if (rows.length > maxRows) console.log(`  ... and ${rows.length - maxRows} more`);
}

async function run() {
  console.log(`\n🔍 Body & Mind ON — Recent Failures (last ${HOURS}h)`);
  console.log(`🔗 Project: ${PROJECT_REF}`);
  console.log(`⏰ Time: ${new Date().toISOString()}`);

  const interval = `${HOURS} hours`;

  // 1. Failed tasks
  printSection(`Failed AI Tasks (last ${HOURS}h)`);
  const failedTasks = await runQuery(pat, PROJECT_REF, `
    select id, user_id, agent_slug, task_type, attempts,
      result->>'error' as error,
      created_at
    from ai_tasks
    where status in ('failed', 'dlq')
      and created_at > now() - interval '${interval}'
    order by created_at desc
    limit 20;
  `);
  formatRows(failedTasks);

  // 2. DLQ tasks (all time — these never get auto-retried)
  printSection('DLQ Tasks (all time — need manual attention)');
  const dlqTasks = await runQuery(pat, PROJECT_REF, `
    select id, user_id, agent_slug, task_type, attempts,
      result->>'error' as error,
      created_at
    from ai_tasks
    where status = 'dlq'
    order by created_at desc
    limit 10;
  `);
  formatRows(dlqTasks);

  // 3. Failed events
  printSection(`Failed AI Events (last ${HOURS}h)`);
  const failedEvents = await runQuery(pat, PROJECT_REF, `
    select id, event_type, user_id, attempts, last_error, status, created_at
    from ai_events
    where status in ('failed', 'dlq')
      and created_at > now() - interval '${interval}'
    order by created_at desc
    limit 10;
  `);
  formatRows(failedEvents);

  // 4. AI logs errors
  printSection(`AI Logs — Error Entries (last ${HOURS}h)`);
  const logErrors = await runQuery(pat, PROJECT_REF, `
    select agent_slug, action, status, error, created_at
    from ai_logs
    where status in ('error', 'failed')
      and created_at > now() - interval '${interval}'
    order by created_at desc
    limit 20;
  `);
  formatRows(logErrors);

  // 5. Email delivery failures
  printSection(`Email Delivery Failures (last ${HOURS}h)`);
  const emailFails = await runQuery(pat, PROJECT_REF, `
    select t.id, t.user_id, t.task_type, t.result->>'email_sent' as email_sent, t.created_at
    from ai_tasks t
    where t.agent_slug = 'trainer'
      and t.task_type = 'initial_plan'
      and t.result->>'email_sent' = 'false'
      and t.created_at > now() - interval '${interval}'
    order by t.created_at desc
    limit 10;
  `);
  if (!emailFails.length) {
    console.log('  ✅ No email failures');
  } else {
    console.log(`  ⚠️  ${emailFails.length} email failure(s):`);
    formatRows(emailFails);
  }

  // 6. Trainer tasks: plan not persisted after completion
  printSection('Trainer Tasks: Completed but No Plan (potential phantom)');
  const phantomTasks = await runQuery(pat, PROJECT_REF, `
    select t.id, t.user_id, t.task_type, t.created_at
    from ai_tasks t
    where t.agent_slug = 'trainer'
      and t.status = 'completed'
      and t.result->>'plan_id' is null
      and t.created_at > now() - interval '${interval}'
    limit 10;
  `);
  if (!phantomTasks.length) {
    console.log('  ✅ All completed trainer tasks have plan_id');
  } else {
    console.log(`  ⚠️  ${phantomTasks.length} trainer task(s) completed without plan_id:`);
    formatRows(phantomTasks);
  }

  // 7. Coach messages missing task_id
  printSection('Coach Messages Missing task_id (provenance gap)');
  const missingProvenace = await runQuery(pat, PROJECT_REF, `
    select id, user_id, task_type, created_at
    from ai_messages
    where task_id is null
      and created_at > now() - interval '${interval}'
    limit 10;
  `);
  if (!missingProvenace.length) {
    console.log('  ✅ All coach messages have task_id');
  } else {
    console.log(`  ⚠️  ${missingProvenace.length} message(s) without task_id:`);
    formatRows(missingProvenace);
  }

  // 8. Events pending for too long (stuck pipeline)
  printSection(`Events Pending > 30 min (stalled pipeline)`);
  const stalledEvents = await runQuery(pat, PROJECT_REF, `
    select id, event_type, user_id, attempts, created_at
    from ai_events
    where status = 'pending'
      and created_at < now() - interval '30 minutes'
    order by created_at asc
    limit 10;
  `);
  if (!stalledEvents.length) {
    console.log('  ✅ No stalled events');
  } else {
    console.log(`  ⚠️  ${stalledEvents.length} event(s) pending for > 30 minutes:`);
    formatRows(stalledEvents);
  }

  // 9. Tasks pending for too long
  printSection('Tasks Pending > 30 min (scheduler not running?)');
  const stalledTasks = await runQuery(pat, PROJECT_REF, `
    select agent_slug, task_type, count(*) as count, min(created_at) as oldest
    from ai_tasks
    where status = 'pending'
      and created_at < now() - interval '30 minutes'
    group by agent_slug, task_type
    order by count desc;
  `);
  if (!stalledTasks.length) {
    console.log('  ✅ No stalled tasks');
  } else {
    console.log(`  ⚠️  Stalled task groups:`);
    formatRows(stalledTasks);
    console.log('\n  ACTION: Run POST /api/ai/run-scheduler with AI_SCHEDULER_SECRET');
  }

  // 10. Summary
  printSection('Quick Summary');
  const summary = await runQuery(pat, PROJECT_REF, `
    select
      (select count(*) from ai_tasks where status = 'failed' and created_at > now() - interval '${interval}') as task_failures,
      (select count(*) from ai_tasks where status = 'dlq') as task_dlq,
      (select count(*) from ai_events where status in ('failed','dlq') and created_at > now() - interval '${interval}') as event_failures,
      (select count(*) from ai_tasks where status = 'pending' and created_at < now() - interval '30 minutes') as stalled_tasks,
      (select count(*) from ai_tasks where agent_slug='trainer' and result->>'email_sent'='false' and created_at > now() - interval '${interval}') as email_failures;
  `);

  const s = summary[0] ?? {};
  const allGood = Object.values(s).every((v) => Number(v) === 0);
  if (allGood) {
    console.log('  🟢 No failures detected in the last ' + HOURS + 'h');
  } else {
    for (const [k, v] of Object.entries(s)) {
      const n = Number(v);
      console.log(`  ${n > 0 ? '🔴' : '🟢'} ${k}: ${v}`);
    }
  }

  console.log('\n✅ Failure check complete.\n');
}

run().catch((err) => {
  console.error('❌ Check failed:', err.message);
  process.exit(1);
});
