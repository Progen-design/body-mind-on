/**
 * GET /api/verify-exercise-registry
 * Ověří, že všechny povinné canonical cviky mají funkční GIF (ExerciseDB) v DB i v kódu.
 */
import { supabaseServer } from '../../lib/supabaseServer';
import {
  TRUSTED_EXERCISE_GIF_BY_KEY,
  TRUSTED_EXTENDED_GIF_BY_KEY,
  assertRegistryRowHasDisplayableMedia,
  isTrustedExercisedbGifUrl,
  mergeWithTrustedRegistryMedia,
} from '../../lib/exerciseRegistryMedia';

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
    const codeChecks = [];
    for (const [key, url] of Object.entries(TRUSTED_EXERCISE_GIF_BY_KEY)) {
      const ok = isTrustedExercisedbGifUrl(url) && (await headOk(url));
      codeChecks.push({ canonical_key: key, url, ok });
    }
    const codeOk = codeChecks.every((c) => c.ok);

    const { data: rows, error } = await supabaseServer
      .from('exercise_asset_registry')
      .select('canonical_key, display_name_cs, gif_url, image_url, trust_level')
      .eq('trust_level', 'exact')
      .in('canonical_key', Object.keys(TRUSTED_EXERCISE_GIF_BY_KEY));

    if (error) throw error;

    const byKey = new Map((rows || []).map((r) => [r.canonical_key, r]));
    const dbChecks = [];

    for (const key of Object.keys(TRUSTED_EXERCISE_GIF_BY_KEY)) {
      const row = byKey.get(key);
      const merged = row ? mergeWithTrustedRegistryMedia(key, row) : null;
      const hasMedia = merged ? assertRegistryRowHasDisplayableMedia(key, merged) : false;
      const gifOk = merged?.gif_url ? await headOk(merged.gif_url) : false;
      dbChecks.push({
        canonical_key: key,
        in_db: Boolean(row),
        gif_url: merged?.gif_url || null,
        gif_http_ok: gifOk,
        ok: hasMedia && gifOk,
      });
    }

    const dbOk = dbChecks.every((c) => c.ok);
    const extendedKeys = Object.keys(TRUSTED_EXTENDED_GIF_BY_KEY);
    const extendedCodeOk = (await Promise.all(
      extendedKeys.map(async (key) => headOk(TRUSTED_EXTENDED_GIF_BY_KEY[key]))
    )).every(Boolean);

    return res.status(codeOk && dbOk && extendedCodeOk ? 200 : 503).json({
      ok: codeOk && dbOk && extendedCodeOk,
      code_trusted_gifs: { ok: codeOk, checks: codeChecks },
      db_canonical_gifs: { ok: dbOk, checks: dbChecks },
      extended_code_gifs: { ok: extendedCodeOk, keys: extendedKeys.length },
    });
  } catch (err) {
    console.error('[verify-exercise-registry]', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Chyba serveru' });
  }
}
