// /pages/api/ai/route.js – POST: route AI request by action to the appropriate agent
import { routeAIRequest } from '../../../lib/agentRouter';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const { action, userId, payload } = body;

    if (!action || typeof action !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing or invalid "action"' });
    }

    const result = await routeAIRequest(action, {
      userId: userId ?? null,
      payload: payload ?? {},
    });

    return res.status(200).json({
      ok: true,
      rawContent: result.rawContent,
      agentSlug: result.agentSlug,
      model: result.model,
    });
  } catch (err) {
    console.error('AI route error:', err);
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
}
