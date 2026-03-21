/**
 * lib/services/exerciseProviderRegistry.js
 * Resolve cviků: nejdřív exercise_asset_registry (DB), pak wger.de.
 *
 * Provider: registry (preferované GIF/obrázky z DB) → wger (lib/services/wgerService.js)
 */
import { resolveExercise as wgerResolve } from './wgerService';
import { resolveToCanonicalKey, getCanonicalExercise } from '../exerciseCanonicalMap';
import { openai } from '../openai';
import { supabaseServer } from '../supabaseServer';

const WGER_SEARCH_NAMES = [
  'squat', 'push-up', 'push up', 'plank', 'lunge', 'deadlift', 'bench press', 'bent over row',
  'pull-up', 'pull up', 'overhead press', 'hip bridge', 'crunch', 'side plank', 'mountain climber',
  'dumbbell row', 'lat pulldown', 'leg press', 'leg curl', 'calf raise', 'shoulder press',
  'bicep curl', 'tricep extension', 'lateral raise', 'romanian deadlift', 'superman', 'walk',
];

/**
 * Přímý výběr z exercise_asset_registry — bez live wger search (správné GIFy / názvy z DB).
 * @param {string} canonicalKey
 * @returns {Promise<object|null>}
 */
async function resolveFromRegistry(canonicalKey) {
  if (!canonicalKey) return null;
  try {
    const { data } = await supabaseServer
      .from('exercise_asset_registry')
      .select(
        'canonical_key, display_name_cs, gif_url, image_url, body_part, target, equipment, exercisedb_name, trust_level, wger_exercise_id, wger_name_en'
      )
      .eq('canonical_key', canonicalKey)
      .maybeSingle();

    if (!data) return null;

    const enName = (data.wger_name_en || data.exercisedb_name || '').trim();
    const displayCs = (data.display_name_cs || '').trim();
    const name = enName || displayCs || canonicalKey;

    return {
      name,
      display_name_cs: displayCs || canonicalKey,
      canonical_key: data.canonical_key,
      image_url: data.gif_url || data.image_url || null,
      video_url: null,
      source: 'registry',
      wger_exercise_id: data.wger_exercise_id != null ? Number(data.wger_exercise_id) : null,
    };
  } catch {
    return null;
  }
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
 * Resolve cviku – nejdřív DB registry, pak wger.
 * @param {string} searchTerm
 * @returns {Promise<{ name: string, display_name_cs: string, canonical_key: string|null, image_url: string|null, video_url: string|null, source: string, wger_exercise_id?: number } | null>}
 */
export async function resolveExercise(searchTerm) {
  const empty = {
    name: null,
    display_name_cs: null,
    canonical_key: null,
    image_url: null,
    video_url: null,
    source: 'none',
    wger_exercise_id: null,
  };
  if (!searchTerm?.trim()) return empty;

  const term = searchTerm.trim();

  const withDisplayCs = (wgerResult, canonicalKeyFromTerm = null) => {
    const canonicalKey = canonicalKeyFromTerm ?? (wgerResult ? resolveToCanonicalKey(wgerResult.name) ?? resolveToCanonicalKey(term) : null);
    const def = canonicalKey ? getCanonicalExercise(canonicalKey) : null;
    const display_name_cs = def?.display_name_cs ?? 'Cvik';
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

  // 1) Canonical z textu → registry (GIF / obrázek / správný název z DB)
  const canonicalKeyEarly = resolveToCanonicalKey(term);
  if (canonicalKeyEarly) {
    const fromReg = await resolveFromRegistry(canonicalKeyEarly);
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
