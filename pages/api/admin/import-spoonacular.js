// POST /api/admin/import-spoonacular — bulk import from Spoonacular complexSearch
import { z } from 'zod';
import { isAdmin } from '../../../lib/adminAuth';
import {
  parseCatalogImportFilters,
  runSpoonacularCatalogImport,
} from '../../../lib/spoonacular/catalogImport';

const importBodySchema = z.object({
  type: z.string().trim().optional(),
  diet: z.string().trim().optional(),
  number: z.coerce.number().int().min(1).max(100).optional().default(100),
  offset: z.coerce.number().int().min(0).optional(),
  pages: z.coerce.number().int().min(1).max(20).optional().default(1),
  minProtein: z.coerce.number().min(0).max(200).optional(),
  maxSugar: z.coerce.number().min(0).max(500).optional(),
  maxCalories: z.coerce.number().min(50).max(5000).optional(),
  maxReadyTime: z.coerce.number().int().min(1).max(600).optional(),
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Neoprávněný přístup' });
  }
  if (!process.env.SPOONACULAR_API_KEY) {
    return res.status(500).json({ error: 'SPOONACULAR_API_KEY is not configured' });
  }

  const parsed = importBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join('; ') });
  }

  const { type, diet, number, offset, pages } = parsed.data;

  const filters = parseCatalogImportFilters(parsed.data);

  try {
    console.log('[import-spoonacular] start', {
      type: type || null,
      diet: diet || null,
      number,
      offset,
      pages,
      filters,
    });

    const result = await runSpoonacularCatalogImport({
      type: type || undefined,
      diet: diet || undefined,
      number,
      offset,
      pages,
      filters,
      useCursor: Boolean(type),
    });

    console.log('[import-spoonacular] done', {
      imported: result.imported,
      updated: result.updated,
      matched: result.matched,
      totalResults: result.totalResults,
      offset: result.offset,
      nextOffset: result.nextOffset,
      quotaLeft: result.quotaLeft,
      requestsUsed: result.requestsUsed,
      stoppedReason: result.stoppedReason || null,
    });

    return res.status(200).json({
      imported: result.imported,
      updated: result.updated,
      matched: result.matched,
      totalResults: result.totalResults,
      offset: result.offset,
      nextOffset: result.nextOffset,
      quotaLeft: result.quotaLeft,
      requestsUsed: result.requestsUsed,
      filters: result.filters,
      stoppedReason: result.stoppedReason,
      errors: result.errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[import-spoonacular] error', msg);
    return res.status(500).json({ error: msg });
  }
}
