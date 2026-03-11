// /pages/api/ai/run-scheduler.js – Run AI task generator + scheduler (cron or manual)
import { generateAITasks } from '../../../lib/generateAITasks';
import { processAIEvents, runAIScheduler } from '../../../lib/aiScheduler';
import { runAIDecisionEngine } from '../../../lib/runAIDecisionEngine';

// Vercel: povolit dlouhý běh (až 300 s na Pro; Hobby může mít nižší limit)
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Autopilot safety: scheduled orchestration must never run as a public endpoint.
    return res.status(500).json({ error: 'CRON_SECRET is not configured' });
  }
  const authHeader = req.headers.authorization || '';
  const bearer = `Bearer ${secret}`;
  if (authHeader !== bearer) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const gen = await generateAITasks();
    const events = await processAIEvents();
    const decisions = await runAIDecisionEngine();
    const run = await runAIScheduler();
    return res.status(200).json({
      ok: true,
      generated: gen.created,
      events,
      decisions,
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
