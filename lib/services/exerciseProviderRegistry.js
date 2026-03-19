/**
 * lib/services/exerciseProviderRegistry.js
 * Resolve cviků – primárně wger.de (veřejné API, bez klíče).
 * Když wger nenajde: zkusí canonical map, pak AI alternativu.
 *
 * Provider: wger (lib/services/wgerService.js)
 * Žádný RapidAPI, ExerciseDB ani další externí zdroje.
 */
import { resolveExercise as wgerResolve } from './wgerService';
import { resolveToCanonicalKey, getCanonicalExercise } from '../exerciseCanonicalMap';
import { openai } from '../openai';

const WGER_SEARCH_NAMES = [
  'squat', 'push-up', 'push up', 'plank', 'lunge', 'deadlift', 'bench press', 'bent over row',
  'pull-up', 'pull up', 'overhead press', 'hip bridge', 'crunch', 'side plank', 'mountain climber',
  'dumbbell row', 'lat pulldown', 'leg press', 'leg curl', 'calf raise', 'shoulder press',
  'bicep curl', 'tricep extension', 'lateral raise', 'romanian deadlift', 'superman', 'walk',
];

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

/**
 * Resolve cviku – wger.de, s fallbackem přes canonical map a AI alternativu.
 * Vrací wger výsledek i bez obrázku/videa – název z API je ověřený.
 * display_name_cs je jediný user-facing název – canonical map má přednost před raw wger name.
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

  // 1) Přímý wger lookup
  let wgerResult = await wgerResolve(term);
  if (wgerResult?.name) return withDisplayCs(wgerResult);

  // 2) Canonical map – pokud máme mapování, zkus wger_search_name
  const canonicalKey = resolveToCanonicalKey(term);
  if (canonicalKey) {
    const def = getCanonicalExercise(canonicalKey);
    const wgerName = def?.wger_search_name;
    if (wgerName && wgerName !== term) {
      wgerResult = await wgerResolve(wgerName);
      if (wgerResult?.name) return withDisplayCs(wgerResult, canonicalKey);
    }
  }

  // 3) AI alternativa – podobný cvik, který wger má
  const aiAlternative = await getAiExerciseAlternative(term);
  if (aiAlternative && aiAlternative.toLowerCase() !== term.toLowerCase()) {
    wgerResult = await wgerResolve(aiAlternative);
    if (wgerResult?.name) return withDisplayCs(wgerResult);
  }

  return empty;
}
