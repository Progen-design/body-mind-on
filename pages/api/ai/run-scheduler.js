// /pages/api/ai/run-scheduler.js – Run AI task generator + scheduler (cron or manual)
import { generateAITasks } from '../../../lib/generateAITasks';
import { runAIScheduler } from '../../../lib/aiScheduler';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const bearer = secret ? `Bearer ${secret}` : '';
  if (secret && authHeader !== bearer) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const gen = await generateAITasks();
    const run = await runAIScheduler();
    return res.status(200).json({
      ok: true,
      generated: gen.created,
      scheduler: run,
    });
  } catch (err) {
    console.error('AI run-scheduler error:', err);
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
}
