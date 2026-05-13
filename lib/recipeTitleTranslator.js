/**
 * Překlady názvů receptů EN → CS po ověření Spoonacular (shoda UI s obsahem odkazu).
 * // FIX (ab2652e+): název vychází z recipe.title z API, ne z halucinovaného name_cs.
 */

import { openai } from './openai';
import { DEFAULT_CHEAP_CHAT_MODEL } from './openaiModels';

const OFF = String(process.env.RECIPE_TITLE_TRANSLATE || '1').trim() === '0';

/**
 * @param {{ slotIndex: number, enTitle: string, mealType?: string }[]} items
 * @returns {Promise<Map<number, { title_cs: string, short_name: string }>>}
 */
export async function batchTranslateVerifiedRecipeTitles(items) {
  const out = new Map();
  if (OFF || !process.env.OPENAI_API_KEY || !Array.isArray(items) || items.length === 0) {
    return out;
  }
  const model = DEFAULT_CHEAP_CHAT_MODEL;
  const chunkSize = 14;
  for (let c = 0; c < items.length; c += chunkSize) {
    const chunk = items.slice(c, c + chunkSize);
    const payload = chunk.map((x) => ({
      idx: x.slotIndex,
      en: String(x.enTitle || '').trim().slice(0, 140),
      meal_type: String(x.mealType || 'meal').slice(0, 40),
    }));
    if (!payload.some((p) => p.en)) continue;
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'Vrať pouze JSON objekt; žádný markdown.' },
          {
            role: 'user',
            content:
              'Přelož anglické názvy receptů do přirozené češtiny. Musí odpovídat ingrediencím z EN názvu (např. eggs = vejce, chicken = kuře). ' +
              'Pro každý řádek vrať title_cs (krátký, max ~8 slov) a short_name (2–4 slova pro e-mail). ' +
              'Formát: {"items":[{"idx":0,"title_cs":"...","short_name":"..."}]}\n' +
              `Vstup: ${JSON.stringify(payload)}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.25,
        max_tokens: 900,
      });
      const raw = completion?.choices?.[0]?.message?.content;
      const parsed = raw ? JSON.parse(raw) : null;
      const arr = Array.isArray(parsed?.items) ? parsed.items : [];
      for (const row of arr) {
        const idx = Number(row.idx);
        const title_cs = typeof row.title_cs === 'string' ? row.title_cs.trim() : '';
        const short_name = typeof row.short_name === 'string' ? row.short_name.trim() : '';
        if (!Number.isFinite(idx) || (!title_cs && !short_name)) continue;
        out.set(idx, {
          title_cs: title_cs || short_name,
          short_name: (short_name || title_cs).slice(0, 120),
        });
      }
    } catch {
      /* nepřerušovat pipeline */
    }
  }
  return out;
}
