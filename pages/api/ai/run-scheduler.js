// /pages/api/ai/run-scheduler.js - Run AI task generator + scheduler (cron or manual)
import { generateAITasks } from '../../../lib/generateAITasks';
import { processAIEvents, runAIScheduler } from '../../../lib/aiScheduler';
import { runAIDecisionEngine } from '../../../lib/runAIDecisionEngine';

// Vercel Pro: az 300 s - jeden trainer task muze bezet cely OpenAI + Spoonacular + wger pipeline.
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
      if (req.method !== 'GET' && req.method !== 'POST') {
              return res.status(405).json({ error: 'Method not allowed' });
      }

  const secret = process.env.CRON_SECRET || process.env.AI_SCHEDULER_SECRET;
      if (!secret) {
              return res.status(500).json({ error: 'CRON_SECRET or AI_SCHEDULER_SECRET is not configured' });
      }
      const authHeader = req.headers.authorization || '';
      const bearer = `Bearer ${secret}`;
      const querySecret = req.query?.secret || req.query?.cron_secret || '';
      const isAuthorized = authHeader === bearer || (querySecret && querySecret === secret);
      if (!isAuthorized) {
              return res.status(401).json({ error: 'Unauthorized' });
      }

  try {
          const gen = await generateAITasks();
          const events = await processAIEvents();
          const decisions = await runAIDecisionEngine();
          const run = await runAIScheduler();
          console.info('[run-scheduler] completed', {
                    gen: gen?.created,
                    legacy_regen_queued: gen?.legacy_regen_queued,
                    events,
                    decisions,
                    run,
          });
          return res.status(200).json({
                    ok: true,
                    generated: gen?.created,
                    events,
                    decisions,
                    scheduler: run,
          });
  } catch (err) {
          console.error('[run-scheduler] error', err);
          return res.status(500).json({ error: String(err?.message || err) });
  }
}
