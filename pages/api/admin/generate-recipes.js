// POST /api/admin/generate-recipes — dávkové generování receptů z fronty
//
// Admin endpoint, ne cron. Generování je jediná operace v systému, která VYTVÁŘÍ
// obsah — u té chce mít člověk ruku na spouštěči, dokud se pár dávek neusadí.
// Fronta je perzistentní, takže cron se dá přidat později bez přepisování logiky.
import { z } from 'zod';
import { isAdmin } from '../../../lib/adminAuth';
import { runRecipeGenerator } from '../../../lib/recipeGeneratorRun';

const bodySchema = z.object({
  dry_run: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  queue_id: z.coerce.number().int().positive().optional(),
});

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = bodySchema.safeParse({ ...(req.body || {}), ...(req.query || {}) });
  if (!parsed.success) {
    return res.status(400).json({ error: 'Neplatné parametry', detail: parsed.error.flatten() });
  }

  const startedAt = new Date().toISOString();
  try {
    const vysledek = await runRecipeGenerator({
      dryRun: parsed.data.dry_run,
      limit: parsed.data.limit,
      queueId: parsed.data.queue_id ?? null,
    });

    console.log(JSON.stringify({
      source: 'admin/generate-recipes',
      event: vysledek.dry_run ? 'dry_run' : 'done',
      started_at: startedAt,
      zapsano: vysledek.zapsano ?? 0,
      zahozeno: vysledek.zahozeno?.length ?? 0,
      cena_usd: vysledek.cena_usd ?? 0,
    }));

    return res.status(200).json({ ok: true, started_at: startedAt, ...vysledek });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      source: 'admin/generate-recipes', event: 'error', started_at: startedAt, error: msg,
    }));
    return res.status(500).json({ ok: false, error: msg, started_at: startedAt });
  }
}
