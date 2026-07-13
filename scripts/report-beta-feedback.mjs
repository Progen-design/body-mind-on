#!/usr/bin/env node
/**
 * Agregovaný beta feedback report — bez PII (text jen s --include-messages + ALLOW).
 * npm run report:beta-feedback
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv, sanitizeOutput } from './audit-utils.mjs';

loadLocalEnv();

const includeMessages = process.argv.includes('--include-messages')
  && String(process.env.ALLOW_FEEDBACK_MESSAGES || '').toLowerCase() === 'yes';

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: rows, error } = await admin
  .from('beta_feedback')
  .select('score, category, context, resolved, message, created_at')
  .order('created_at', { ascending: false });

if (error) {
  console.error('FAIL load feedback');
  process.exit(1);
}

const list = rows || [];
console.log('BETA FEEDBACK REPORT\n');
console.log(`Total feedback: ${list.length}`);

const scores = list.filter((r) => r.score != null).map((r) => r.score);
const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '—';
console.log(`Average score: ${avg}`);

const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
for (const s of scores) dist[s] = (dist[s] || 0) + 1;
console.log('Score distribution:', JSON.stringify(dist));

const byCat = {};
const byCtx = {};
for (const r of list) {
  const c = r.category || 'none';
  const x = r.context || 'none';
  byCat[c] = (byCat[c] || 0) + 1;
  byCtx[x] = (byCtx[x] || 0) + 1;
}
console.log('Categories:', JSON.stringify(byCat));
console.log('Contexts:', JSON.stringify(byCtx));
console.log(`Unresolved: ${list.filter((r) => !r.resolved).length}`);

if (includeMessages) {
  console.log('\nRecent messages (max 20, redacted):');
  for (const r of list.slice(0, 20)) {
    if (!r.message) continue;
    const redacted = sanitizeOutput(String(r.message).replace(/\S+@\S+\.\S+/g, '[email]'));
    console.log(`- [${r.context}/${r.category}] ${redacted.slice(0, 200)}`);
  }
}
