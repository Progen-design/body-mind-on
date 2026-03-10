import https from 'https';

const pat = process.argv[2] || 'sbp_ee745b806074a84fa1bebd2e9e2b23f06ce2805b';
const PROJECT_REF = 'ipfyavvmmxmsjupmfnes';

const sql = [
  "SELECT 'ai_agents' as tbl, count(*)::text as cnt FROM ai_agents",
  "UNION ALL SELECT 'ai_task_types', count(*)::text FROM ai_task_types",
  "UNION ALL SELECT 'ai_trigger_rules', count(*)::text FROM ai_trigger_rules",
  "UNION ALL SELECT 'ai_context_profiles', count(*)::text FROM ai_context_profiles",
  "UNION ALL SELECT 'ai_executor_bindings', count(*)::text FROM ai_executor_bindings",
  "UNION ALL SELECT 'idx_idempotency_exists', (SELECT count(*)::text FROM pg_indexes WHERE indexname = 'idx_ai_tasks_idempotency')",
  "UNION ALL SELECT 'idempotency_col_exists', (SELECT count(*)::text FROM information_schema.columns WHERE table_name = 'ai_tasks' AND column_name = 'idempotency_key')",
].join(' ');

function query(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const r = await query(sql);
if (r.status !== 200) {
  console.error('ERROR', r.status, JSON.stringify(r.data));
  process.exit(1);
}

console.log('\nProdukční DB – stav po migraci:');
console.log('─'.repeat(40));
for (const row of r.data) {
  const ok = Number(row.cnt) > 0 ? '✅' : '❌';
  console.log(`${ok}  ${row.tbl.padEnd(28)} ${row.cnt}`);
}
console.log('─'.repeat(40));

// Also check agent slugs
const agents = await query("SELECT slug, enabled FROM ai_agents ORDER BY slug");
console.log('\nAI Agenti:');
for (const a of agents.data) {
  console.log(`  - ${a.slug.padEnd(25)} enabled=${a.enabled}`);
}
