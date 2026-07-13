// POST /api/beta-feedback — in-app beta feedback (authenticated only)
import { supabaseServer } from '../../lib/supabaseServer';
import { createSupabaseUserClient } from '../../lib/supabaseUserClient';
import { BETA_FEEDBACK_CONTEXTS, BETA_FEEDBACK_CATEGORIES } from '../../lib/productEventAllowlist';
import { recordProductEvent } from '../../lib/recordProductEvent';
import { isAnyRateLimited } from '../../lib/rateLimit';

const MAX_MESSAGE_LEN = 1000;
const DAILY_FEEDBACK_LIMIT = 10;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function sanitizeMessage(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, MAX_MESSAGE_LEN);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Nejste přihlášen' });
  }

  const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
  if (userErr || !user?.id) {
    return res.status(401).json({ error: 'Neplatná session' });
  }

  const limited = isAnyRateLimited(
    [`beta-feedback:${user.id}`],
    DAILY_FEEDBACK_LIMIT,
    RATE_WINDOW_MS,
  );
  if (limited) {
    return res.status(429).json({ error: 'Denní limit zpětné vazby byl vyčerpán.' });
  }

  const context = String(req.body?.context || '').trim();
  const category = req.body?.category ? String(req.body.category).trim() : null;
  const scoreRaw = req.body?.score;
  const score = scoreRaw == null ? null : Number(scoreRaw);
  const message = req.body?.message ? sanitizeMessage(req.body.message) : null;

  if (!BETA_FEEDBACK_CONTEXTS.includes(context)) {
    return res.status(400).json({ error: 'Neplatný kontext.' });
  }
  if (category && !BETA_FEEDBACK_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Neplatná kategorie.' });
  }
  if (score != null && (!Number.isInteger(score) || score < 1 || score > 5)) {
    return res.status(400).json({ error: 'Neplatné hodnocení.' });
  }
  if (req.body?.message && message.length === 0) {
    return res.status(400).json({ error: 'Zpráva je prázdná.' });
  }

  const row = {
    user_id: user.id,
    context,
    score: score == null ? null : score,
    category,
    message: message || null,
    app_version: process.env.npm_package_version || '1.0.0',
  };

  const db = createSupabaseUserClient(token);
  const { error: insErr } = await db.from('beta_feedback').insert(row);
  if (insErr) {
    console.error('[api/beta-feedback] insert failed');
    return res.status(500).json({ error: 'Zpětnou vazbu se nepodařilo uložit.' });
  }

  await recordProductEvent({
    user_id: user.id,
    event_name: 'feedback_submitted',
    properties: {
      source_component: context,
      feedback_score: score == null ? undefined : score,
    },
  });

  return res.status(200).json({ ok: true });
}
