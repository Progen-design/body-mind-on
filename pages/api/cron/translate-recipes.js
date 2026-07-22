// GET/POST /api/cron/translate-recipes — every 5 min while untranslated rows exist
import { isCronAuthorized } from '../../../lib/adminAuth';
import { runCatalogRecipeTranslation } from '../../../lib/spoonacular/catalogTranslate';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = isCronAuthorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  const startedAt = new Date().toISOString();

  try {
    const result = await runCatalogRecipeTranslation({ batch: 20 });

    if (result.remaining <= 0) {
      console.log('[cron/translate-recipes] nothing remaining', startedAt);
    } else {
      console.log('[cron/translate-recipes] batch done', {
        translated: result.translated,
        remaining: result.remaining,
      });
    }

    return res.status(200).json({
      ok: true,
      started_at: startedAt,
      translated: result.translated,
      remaining: result.remaining,
      errors: result.errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/translate-recipes] error', msg);
    return res.status(500).json({ ok: false, error: msg, started_at: startedAt });
  }
}
