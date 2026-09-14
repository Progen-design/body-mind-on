/**
 * GET /api/verify-exercise-registry
 * Ověří funkční média (vlastní Storage animace) canonical cviků v DB i v kódu.
 *
 * TRUSTED_EXERCISE_GIF_BY_KEY a TRUSTED_EXTENDED_GIF_BY_KEY jsou od 14. 9. 2026
 * natrvalo prázdné (docs/DALSI_KROK.md 9.12) — už neexistuje seznam „povinných"
 * cviků s natvrdo daným fallbackem. Endpoint proto místo pevného seznamu ověří
 * VŠECH 207 cviků, co mají v registru vlastní Storage animaci.
 */
import { supabaseServer } from '../lib/supabaseServer.js';
import {
  assertRegistryRowHasDisplayableMedia,
  isTrustedExerciseMediaUrl,
  mergeWithTrustedRegistryMedia,
} from '../lib/exerciseRegistryMedia.js';

async function headOk(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data: rows, error } = await supabaseServer
      .from('exercise_asset_registry')
      .select('canonical_key, display_name_cs, gif_url, image_url, trust_level')
      .eq('trust_level', 'exact')
      .not('gif_url', 'is', null);

    if (error) throw error;

    const dbChecks = [];
    for (const row of rows || []) {
      const merged = mergeWithTrustedRegistryMedia(row.canonical_key, row);
      const hasMedia = assertRegistryRowHasDisplayableMedia(row.canonical_key, merged);
      const isOwnStorage = Boolean(merged.gif_url && isTrustedExerciseMediaUrl(merged.gif_url));
      const gifOk = merged.gif_url ? await headOk(merged.gif_url) : false;
      dbChecks.push({
        canonical_key: row.canonical_key,
        gif_url: merged.gif_url || null,
        is_own_storage: isOwnStorage,
        gif_http_ok: gifOk,
        ok: hasMedia && isOwnStorage && gifOk,
      });
    }

    const dbOk = dbChecks.every((c) => c.ok);

    return res.status(dbOk ? 200 : 503).json({
      ok: dbOk,
      db_storage_gifs: { ok: dbOk, count: dbChecks.length, checks: dbChecks },
    });
  } catch (err) {
    console.error('[verify-exercise-registry]', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Chyba serveru' });
  }
}
