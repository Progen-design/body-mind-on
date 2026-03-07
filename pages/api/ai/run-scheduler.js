// /pages/api/ai/run-scheduler.js – Run AI task generator + scheduler (cron or manual)
import { generateAITasks } from '../../../lib/generateAITasks';
import { processAIEvents, runAIScheduler } from '../../../lib/aiScheduler';

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
    const events = await processAIEvents();
    const run = await runAIScheduler();
    return res.status(200).json({
      ok: true,
      generated: gen.created,
      events,
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
