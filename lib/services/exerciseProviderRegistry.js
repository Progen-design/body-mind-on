/**
 * lib/services/exerciseProviderRegistry.js
 * Resolve cviků: nejdřív exercise_asset_registry (DB cache), pak živé wger.de.
 *
 * Provider: registry → doplnění médií přes lib/wgerClient.js → wger search (lib/services/wgerService.js)
 */
import { resolveExercise as wgerResolve } from './wgerService';
import { resolveToCanonicalKey, getCanonicalExercise } from '../exerciseCanonicalMap';
import { openai } from '../openai';
import { supabaseServer } from '../supabaseServer';
import { getWgerExerciseImages } from '../wgerClient';

const WGER_SEARCH_NAMES = [
  'squat', 'push-up', 'push up', 'plank', 'lunge', 'deadlift', 'bench press', 'bent over row',
  'pull-up', 'pull up', 'overhead press', 'hip bridge', 'crunch', 'side plank', 'mountain climber',
  'dumbbell row', 'lat pulldown', 'leg press', 'leg curl', 'calf raise', 'shoulder press',
  'bicep curl', 'tricep extension', 'lateral raise', 'romanian deadlift', 'superman', 'walk',
];

/**
 * Přímý výběr z exercise_asset_registry — bez live wger search (správné GIFy / názvy z DB).
 * @param {string} canonicalKey
 * @param {string} [nameHintCs] – z AI (name_cs); UI název preferuje kanonický / DB český název, hint až poté
 * @returns {Promise<object|null>}
 */
async function resolveFromRegistry(canonicalKey, nameHintCs) {
  if (!canonicalKey) return null;
  try {
    const { data } = await supabaseServer
      .from('exercise_asset_registry')
      .select(
        'canonical_key, display_name_cs, gif_url, image_url, wger_exercise_image_url, body_part, target, equipment, exercisedb_name, trust_level, wger_exercise_id, wger_name_en'
      )
      .eq('canonical_key', canonicalKey)
      .maybeSingle();

    if (!data) return null;

    let gifUrl = data.gif_url || null;
    let imgUrl = data.image_url || data.wger_exercise_image_url || null;
    let imageUrl = gifUrl || imgUrl;

    if (!imageUrl && data.wger_exercise_id) {
      const imgs = await getWgerExerciseImages(data.wger_exercise_id);
      const resolved = imgs.gif || imgs.image;
      if (resolved) {
        imageUrl = resolved;
        gifUrl = imgs.gif || gifUrl;
        imgUrl = imgs.image || imgUrl;
        try {
          await supabaseServer
            .from('exercise_asset_registry')
            .update({
              gif_url: gifUrl ?? null,
              image_url: imgUrl ?? null,
              wger_exercise_image_url: imgs.image ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq('canonical_key', canonicalKey);
        } catch {
          // non-fatal cache write
        }
      }
    }

    const enName = (data.wger_name_en || data.exercisedb_name || '').trim();
    const displayCs = (data.display_name_cs || '').trim();
    const hint = typeof nameHintCs === 'string' ? nameHintCs.trim() : '';
    const name = enName || displayCs || canonicalKey;

    return {
      name,
      display_name_cs: displayCs || hint || canonicalKey,
      canonical_key: data.canonical_key,
      image_url: imageUrl || null,
      video_url: null,
      source: 'registry',
      wger_exercise_id: data.wger_exercise_id != null ? Number(data.wger_exercise_id) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Batch: canonical_key → registry + živé doplnění obrázků z wger.
 * @param {Array<object>} exercises
 * @param {import('@supabase/supabase-js').SupabaseClient|null} [supabase]
 * @returns {Promise<Array<object>>}
 */
export async function resolveWorkoutExercises(exercises, supabase) {
  const client = supabase || supabaseServer;
  const list = Array.isArray(exercises) ? exercises : [];
  const keys = [...new Set(list.map((e) => e?.canonical_key).filter(Boolean))];

  if (!keys.length) {
    return list.map((ex) => ({
      ...ex,
      source: 'fallback',
    }));
  }

  let rows = [];
  try {
    const { data } = await client
      .from('exercise_asset_registry')
      .select(
        'canonical_key, display_name_cs, gif_url, image_url, wger_exercise_image_url, body_part, target, equipment, wger_exercise_id, wger_name_en'
      )
      .in('canonical_key', keys);
    rows = data || [];
  } catch {
    rows = [];
  }

  const reg = new Map(rows.map((r) => [r.canonical_key, r]));

  return Promise.all(
    list.map(async (ex) => {
      const key = ex?.canonical_key;
      const row = key ? reg.get(key) : null;

      let gifUrl = row?.gif_url || null;
      let imgUrl = row?.image_url || row?.wger_exercise_image_url || null;
      let imageUrl = gifUrl || imgUrl;

      if (!imageUrl && row?.wger_exercise_id) {
        const imgs = await getWgerExerciseImages(row.wger_exercise_id);
        const resolved = imgs.gif || imgs.image;
        if (resolved) {
          imageUrl = resolved;
          gifUrl = imgs.gif || gifUrl;
          imgUrl = imgs.image || imgUrl;
          if (key) {
            client
              .from('exercise_asset_registry')
              .update({
                gif_url: gifUrl ?? null,
                image_url: imgUrl ?? null,
                wger_exercise_image_url: imgs.image ?? null,
                updated_at: new Date().toISOString(),
              })
              .eq('canonical_key', key)
              .then(() => {})
              .catch(() => {});
          }
        }
      }

      return {
        ...ex,
        canonical_key: key || null,
        display_name_cs: row?.display_name_cs || ex?.name || key || null,
        image_url: imageUrl || null,
        gif_url: gifUrl || null,
        wger_exercise_id: row?.wger_exercise_id != null ? Number(row.wger_exercise_id) : null,
        body_part: row?.body_part ?? null,
        target: row?.target ?? null,
        equipment: row?.equipment ?? null,
        exercise_verified: row?.wger_name_en || null,
        source: row ? 'registry' : 'fallback',
      };
    })
  );
}

/**
 * AI navrhne podobný cvik, který existuje ve wger.de.
 * @param {string} originalTerm
 * @returns {Promise<string|null>}
 */
async function getAiExerciseAlternative(originalTerm) {
  if (!originalTerm?.trim() || !process.env.OPENAI_API_KEY) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 50,
      messages: [
        {
          role: 'system',
          content: `Jsi fitness asistent. Uživatel chtěl cvik "${originalTerm}", ale wger.de API ho nenašlo.
Tvá úloha: vrať JEDEN podobný cvik v angličtině (max 4 slova), který wger.de určitě má.
Příklady cviků ve wger: ${WGER_SEARCH_NAMES.join(', ')}.
Odpověz POUZE názvem cviku, nic jiného. Např. "squat" nebo "push up" nebo "bent over row".`,
        },
        { role: 'user', content: `Původní cvik: ${originalTerm.trim().slice(0, 80)}. Jaký podobný cvik má wger?` },
      ],
    });
    const raw = (completion.choices?.[0]?.message?.content || '').trim().slice(0, 60);
    return raw || null;
  } catch {
    return null;
  }
}

/** wger: nejdřív EN (2), pak CS (9) — české názvy z AI často projdou až v CS. */
async function tryWgerEnCs(query) {
  if (!query?.trim()) return null;
  const q = query.trim();
  let r = await wgerResolve(q, { language: 2 });
  if (r?.name) return r;
  r = await wgerResolve(q, { language: 9 });
  return r?.name ? r : null;
}

/**
 * Resolve cviku – nejdřív DB registry, pak wger (vyhledání přes exerciseinfo / translation).
 * @param {string} searchTerm
 * @param {{ canonicalKey?: string|null, nameHintCs?: string|null }} [opts]
 * @returns {Promise<{ name: string, display_name_cs: string, canonical_key: string|null, image_url: string|null, video_url: string|null, source: string, wger_exercise_id?: number } | null>}
 */
export async function resolveExercise(searchTerm, opts = {}) {
  const empty = {
    name: null,
    display_name_cs: null,
    canonical_key: null,
    image_url: null,
    video_url: null,
    source: 'none',
    wger_exercise_id: null,
  };
  const nameHintCs = typeof opts.nameHintCs === 'string' ? opts.nameHintCs.trim() : '';

  const termRaw = (searchTerm && String(searchTerm).trim()) || '';
  const canonicalFromAgent = typeof opts.canonicalKey === 'string' ? opts.canonicalKey.trim().toLowerCase() : '';

  if (!termRaw && !canonicalFromAgent) return empty;

  const term = termRaw || canonicalFromAgent || '';

  const withDisplayCs = (wgerResult, canonicalKeyFromTerm = null) => {
    const canonicalKey = canonicalKeyFromTerm ?? (wgerResult ? resolveToCanonicalKey(wgerResult.name) ?? resolveToCanonicalKey(term) : null);
    const def = canonicalKey ? getCanonicalExercise(canonicalKey) : null;
    const fromMap = (def?.display_name_cs && String(def.display_name_cs).trim()) || '';
    const display_name_cs = fromMap || (nameHintCs || '') || 'Cvik';
    return {
      name: wgerResult?.name ?? term,
      display_name_cs,
      canonical_key: canonicalKey,
      image_url: wgerResult?.image_url ?? null,
      video_url: wgerResult?.video_url ?? null,
      source: wgerResult?.source ?? 'wger',
      wger_exercise_id: wgerResult?.wger_exercise_id ?? null,
    };
  };

  // 0) Agent v6: canonical_key → registry → wger_search_name z mapy
  if (canonicalFromAgent) {
    const fromReg = await resolveFromRegistry(canonicalFromAgent, nameHintCs || undefined);
    if (fromReg) return fromReg;
    const defAg = getCanonicalExercise(canonicalFromAgent);
    const wgerNameAg = defAg?.wger_search_name;
    if (wgerNameAg) {
      const wgerResult = await tryWgerEnCs(wgerNameAg);
      if (wgerResult?.name) return withDisplayCs(wgerResult, canonicalFromAgent);
    }
  }

  // 1) Canonical z textu → registry (GIF / obrázek / správný název z DB)
  const canonicalKeyEarly = resolveToCanonicalKey(term);
  if (canonicalKeyEarly) {
    const fromReg = await resolveFromRegistry(canonicalKeyEarly, nameHintCs || undefined);
    if (fromReg) return fromReg;
  }

  // 2) Canonical → wger_search_name (live API jen když v registry nic)
  if (canonicalKeyEarly) {
    const def = getCanonicalExercise(canonicalKeyEarly);
    const wgerName = def?.wger_search_name;
    if (wgerName) {
      const wgerResult = await tryWgerEnCs(wgerName);
      if (wgerResult?.name) return withDisplayCs(wgerResult, canonicalKeyEarly);
    }
  }

  // 3) Přímý dotaz na wger (EN + CS)
  let wgerResult = await tryWgerEnCs(term);
  if (wgerResult?.name) return withDisplayCs(wgerResult);

  // 4) AI alternativa – podobný cvik, který wger má
  const aiAlternative = await getAiExerciseAlternative(term);
  if (aiAlternative && aiAlternative.toLowerCase() !== term.toLowerCase()) {
    wgerResult = await tryWgerEnCs(aiAlternative);
    if (wgerResult?.name) return withDisplayCs(wgerResult);
  }

  return empty;
}
