// POST /api/admin/translate-recipes — batch EN→CS translation via OpenAI
import { z } from 'zod';
import { isAdmin } from '../../../lib/adminAuth';
import { runCatalogRecipeTranslation } from '../../../lib/spoonacular/catalogTranslate';

const translateBodySchema = z.object({
  batch: z.coerce.number().int().min(1).max(50).optional().default(20),
  ids: z.array(z.coerce.number().int().positive()).optional(),
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Neoprávněný přístup' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  const parsed = translateBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join('; ') });
  }

  try {
    console.log('[translate-recipes] start', { batch: parsed.data.batch });

    const result = await runCatalogRecipeTranslation({
      batch: parsed.data.batch,
      ids: parsed.data.ids,
    });

    console.log('[translate-recipes] done', {
      translated: result.translated,
      remaining: result.remaining,
      errorCount: result.errors?.length ?? 0,
    });

    return res.status(200).json({
      translated: result.translated,
      remaining: result.remaining,
      errors: result.errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[translate-recipes] error', msg);
    return res.status(500).json({ error: msg });
  }
}
