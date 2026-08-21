// POST /api/admin/recipes/{id}/review — schválení nebo zamítnutí receptu
//
// Schválení jen SUNDÁ pending_review. Aktivaci pak posoudí normální brána
// (trigger + denní sweeper) — schvalování je součást brány, ne obchazka kolem ní.
// Zamítnutí recept smaže a důvod zapíše do ai_runs, ať je z čeho upravovat prompt.
import { z } from 'zod';
import { isAdmin } from '../../../../lib/adminAuth.js';
import { booleanParamRequired } from '../../../../lib/httpParams.js';
import { supabaseServer } from '../../../../lib/supabaseServer.js';
import { RECIPE_GEN_MODEL, RECIPE_GEN_TEMPERATURE, RECIPE_GEN_PROMPT_SHA256 } from '../../../../lib/recipeGenerator.js';

const bodySchema = z.object({
  // Ne z.coerce.boolean() — to by z {"approve":"false"} udělalo schválení.
  approve: booleanParamRequired(),
  reason: z.string().trim().max(500).optional(),
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const id = Number(req.query?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Neplatné id' });
  }

  const parsed = bodySchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Chybí approve', detail: parsed.error.flatten() });
  }

  try {
    const { data: recept, error: chybaCteni } = await supabaseServer
      .from('recipes_catalog')
      .select('id, name_cs, pending_review')
      .eq('id', id)
      .maybeSingle();

    if (chybaCteni) throw new Error(chybaCteni.message);
    if (!recept) return res.status(404).json({ error: 'Recept nenalezen' });
    if (!recept.pending_review) {
      return res.status(409).json({ error: 'Recept už není ve stavu pending_review' });
    }

    if (parsed.data.approve) {
      const { error } = await supabaseServer
        .from('recipes_catalog')
        .update({ pending_review: false })
        .eq('id', id);
      if (error) throw new Error(error.message);

      return res.status(200).json({
        ok: true, id, schvaleno: true, name_cs: recept.name_cs,
        poznamka: 'Aktivaci posoudi brana pri nejblizsim sweepu.',
      });
    }

    // Zamítnutí: důvod je vstup pro úpravu promptu, proto se ukládá dřív než smazání.
    await supabaseServer.from('ai_runs').insert({
      purpose: 'recipe_review_rejected',
      recipe_id: id,
      model: RECIPE_GEN_MODEL,
      temperature: RECIPE_GEN_TEMPERATURE,
      prompt_sha256: RECIPE_GEN_PROMPT_SHA256,
      result: { name_cs: recept.name_cs, reason: parsed.data.reason ?? null },
    });

    const { error: chybaMazani } = await supabaseServer
      .from('recipes_catalog').delete().eq('id', id);
    if (chybaMazani) throw new Error(chybaMazani.message);

    return res.status(200).json({ ok: true, id, schvaleno: false, smazano: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: msg });
  }
}
