/**
 * GET /api/exercise-media?canonical_key=lunges&name=Výpady
 * Načte ověřená média cviku z exercise_asset_registry (priorita) nebo wger fallback.
 */
import { supabaseServer } from '../../lib/supabaseServer';
import { enrichExercise } from '../../lib/exerciseEnrichment';
import { resolveToCanonicalKey } from '../../lib/exerciseCanonicalMap';
import { collectExerciseMediaSources, hasDisplayableExerciseMedia } from '../../lib/exerciseMediaHelpers';
import { mergeWithTrustedRegistryMedia } from '../../lib/exerciseRegistryMedia';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const canonicalRaw = typeof req.query.canonical_key === 'string' ? req.query.canonical_key.trim().toLowerCase() : '';
    const nameRaw = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    const wgerRaw = req.query.wger_id;
    const wgerParsed = wgerRaw != null && wgerRaw !== '' ? Number(wgerRaw) : NaN;
    const wgerId = Number.isFinite(wgerParsed) && wgerParsed > 0 ? wgerParsed : null;

    const canonicalKey = canonicalRaw || resolveToCanonicalKey(nameRaw) || null;

    if (canonicalKey) {
      const { data } = await supabaseServer
        .from('exercise_asset_registry')
        .select('canonical_key, display_name_cs, gif_url, image_url, wger_exercise_image_url, wger_exercise_id, wger_name_en')
        .eq('canonical_key', canonicalKey)
        .eq('trust_level', 'exact')
        .maybeSingle();

      if (data) {
        const merged = mergeWithTrustedRegistryMedia(canonicalKey, data);
        const media = collectExerciseMediaSources(merged);
        if (hasDisplayableExerciseMedia(media)) {
          return res.status(200).json({
            ok: true,
            canonical_key: canonicalKey,
            display_name_cs: data.display_name_cs || null,
            wger_exercise_id: data.wger_exercise_id ?? null,
            ...media,
          });
        }
      }
    }

    const enriched = await enrichExercise(nameRaw || canonicalKey || 'exercise', {
      wger_exercise_id: wgerId ?? undefined,
    });
    const media = collectExerciseMediaSources(enriched);

    return res.status(200).json({
      ok: hasDisplayableExerciseMedia(media),
      canonical_key: enriched.canonical_key || canonicalKey,
      display_name_cs: enriched.name || nameRaw || null,
      wger_exercise_id: enriched.wger_exercise_id ?? wgerId,
      ...media,
    });
  } catch (err) {
    console.error('[exercise-media]', err);
    return res.status(500).json({ error: err?.message || 'Chyba serveru' });
  }
}
