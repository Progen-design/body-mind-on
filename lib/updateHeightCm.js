// lib/updateHeightCm.js
//
// JEDINÉ MÍSTO, KTERÉ UMÍ ULOŽIT VÝŠKU. Kdokoli chce zapsat `height_cm`,
// volá tuhle funkci — ať už z api/profile-settings.js nebo
// api/profile-body-data.js. Modal dnes posílá výšku na profile-settings,
// ale kdyby to jednou vedlo jinam, chování se nerozejde, protože obě cesty
// stojí na stejné funkci.
//
// PŘÍČINA 31. 8. 2026 (docs/DALSI_KROK.md 6.5): `api/profile-settings.js`
// psal výšku JEN do `user_metadata` (zrcadlo pro hlavičku profilu), nikdy
// do `body_metrics` (zdroj pravdy pro generate-plan.js a nutritionTargets.js).
// Uživatel změnil výšku ze 182 na 194 cm, hlavička to ukázala, plán a
// kalorický cíl zůstaly počítané ze 182.
//
// Plán se NEPŘEGENERUJE — to je vědomé rozhodnutí (etapa 6.5, bod 3), ne
// opomenutí. Regenerace i s e-mailem zůstává vyhrazená pro
// api/profile-preferences.js.
import { supabaseServer } from './supabaseServer.js';
import { overVysku } from './vyskaMeze.js';
import { buildHeightUpdatePatch } from './heightUpdatePatch.js';
import { emitCalorieTargetChangedEvent } from './calorieTargetIntegrity.js';

/**
 * @param {{ userId: string, user: { user_metadata?: object } | null, heightCm: unknown }} args
 * @returns {Promise<
 *   { ok: true, height_cm: number, calories_target: number }
 *   | { ok: false, error: string }
 * >}
 */
export async function updateHeightCm({ userId, user, heightCm }) {
  const overeno = overVysku(heightCm);
  if (!overeno.ok) {
    return { ok: false, error: overeno.chyba };
  }

  const { data: latest, error: latestErr } = await supabaseServer
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr || !latest?.id) {
    return { ok: false, error: 'Nejprve dokonči registraci.' };
  }

  const { bodyMetricsPatch, metadataPatch } = buildHeightUpdatePatch(latest, overeno.cm);

  const { error: bmErr } = await supabaseServer
    .from('body_metrics')
    .update(bodyMetricsPatch)
    .eq('id', latest.id);
  if (bmErr) {
    console.error('[updateHeightCm] body_metrics update error:', bmErr);
    return { ok: false, error: 'Nepodařilo se uložit výšku.' };
  }

  // docs/DALSI_KROK.md 8.1 — jedno z pěti míst, kde se `calories_target`
  // opravdu mění (viz `emitCalorieTargetChangedEvent`). Přesně tenhle případ
  // (oprava výšky 182 → 194) byl 31. 8. 2026 příčinou nesouladu cíle
  // a plánu, který nikdo nezaznamenal — viz docs/DALSI_KROK.md 6.5 a 7.2a.
  await emitCalorieTargetChangedEvent(userId, {
    oldCaloriesTarget: latest.calories_target,
    patch: bodyMetricsPatch,
    source: 'height_updated',
  });

  // Zrcadlo. Zdroj pravdy (body_metrics) už je zapsaný — pokud tohle selže,
  // hlavička profilu chvíli ukáže starou výšku, ale plán a kalorie počítají
  // správně. Neselhávat celý request kvůli zrcadlu.
  const currentMeta = user?.user_metadata || {};
  const { error: metaErr } = await supabaseServer.auth.admin.updateUserById(userId, {
    user_metadata: { ...currentMeta, ...metadataPatch },
  });
  if (metaErr) {
    console.warn('[updateHeightCm] user_metadata mirror update failed:', metaErr);
  }

  return {
    ok: true,
    height_cm: bodyMetricsPatch.height_cm,
    calories_target: bodyMetricsPatch.calories_target,
  };
}
