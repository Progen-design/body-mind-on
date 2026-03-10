import https from 'https';

const PROJECT_REF = 'ipfyavvmmxmsjupmfnes';
const pat = process.argv[2];

function query(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${pat}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d || '[]')));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const checks = [
  { label: 'ai_messages table', sql: `SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_messages' ORDER BY ordinal_position` },
  { label: 'ai_content_drafts columns', sql: `SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_content_drafts' ORDER BY ordinal_position` },
  { label: 'ai_logs new columns', sql: `SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_logs' AND column_name IN ('action','event_id','result','error','payload')` },
  { label: 'ai_tasks max_attempts', sql: `SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_tasks' AND column_name = 'max_attempts'` },
  { label: 'ai_events max_attempts', sql: `SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_events' AND column_name = 'max_attempts'` },
];

for (const { label, sql } of checks) {
  const rows = await query(sql);
  const cols = rows.map(r => r.column_name || JSON.stringify(r)).join(', ');
  const ok = rows.length > 0;
  console.log(`${ok ? '✅' : '❌'} ${label}: ${cols || 'NOT FOUND'}`);
}
