// /pages/api/ai/run-scheduler.js
//
// NUCLEAR SHUTDOWN MODE (2026-06-02):
// All AI scheduler pipelines are frozen until BMON is ready for paid users.
// This endpoint now returns 200 with a no-op response so Vercel does not log
// errors if anything still hits the URL (cron is removed, but cached configs,
// uptime monitors, or browser extensions may probe).
//
// To re-enable: remove this stub and restore from git history (see commit ab2652e).

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
    return res.status(200).json({
          ok: true,
          frozen: true,
          message: 'AI scheduler is in nuclear shutdown mode. No tasks generated.',
          docs: 'See lib/generateAITasks.js TASK_CREATION_FROZEN flag.',
          ts: new Date().toISOString(),
    });
}
