/**
 * lib/recipeLocalization.js
 * Lokalizace receptů Spoonacular do češtiny.
 * Cache podle recipe_id – nepřekládat znovu, pokud už lokalizace existuje.
 * Raw angličtina se nesmí dostat do finálního UI ani e-mailu.
 */
import { openai } from './openai';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dní
const titleCache = new Map(); // recipe_id -> { display_name_cs, at }
const fullCache = new Map(); // recipe_id -> { display_name_cs, ingredients_cs, instructions_cs, at }

function isCacheFresh(entry) {
  if (!entry?.at) return false;
  return Date.now() - entry.at < CACHE_TTL_MS;
}

/**
 * Batch překlad názvů receptů – jeden OpenAI call místo N.
 * @param {Array<{ title: string, recipeId?: number }>} items
 * @returns {Promise<string[]>}
 */
export async function batchTranslateRecipeTitlesToCzech(items) {
  if (!items?.length) return [];
  // Prázdný řetězec = volající použije name_cs z AI nebo jiný fallback (ne generické „Jídlo“).
  if (!process.env.OPENAI_API_KEY) return items.map(() => '');

  const toTranslate = items.map((i) => (i.title || '').trim().slice(0, 80)).filter(Boolean);
  if (!toTranslate.length) return items.map(() => '');

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content: 'Přelož názvy receptů do češtiny. Odpověz POUZE validním JSON: {"titles": ["český název 1", "český název 2", ...]} – stejný počet a pořadí jako vstup. Žádný úvod.',
        },
        { role: 'user', content: JSON.stringify(toTranslate) },
      ],
      response_format: { type: 'json_object' },
    });
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return items.map(() => '');
    const parsed = JSON.parse(raw);
    const titles = Array.isArray(parsed?.titles) ? parsed.titles : [];
    let idx = 0;
    return items.map((item) => {
      const t = (item.title || '').trim();
      if (!t) return '';
      const r = (titles[idx++] || '').toString().trim();
      return r && r !== t ? r : '';
    });
  } catch {
    return items.map(() => '');
  }
}

/**
 * Přeloží název receptu do češtiny.
 * @param {string} title - anglický název
 * @param {number} [recipeId] - pro cache key
 * @returns {Promise<string>}
 */
export async function translateRecipeTitleToCzech(title, recipeId = null) {
  if (!title || typeof title !== 'string') return '';
  const key = recipeId != null ? `title:${recipeId}` : `title:${title.slice(0, 80)}`;
  const cached = titleCache.get(key);
  if (cached && isCacheFresh(cached)) return cached.display_name_cs;

  if (!process.env.OPENAI_API_KEY) return '';

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 80,
      messages: [
        {
          role: 'system',
          content: 'Přelož název receptu do češtiny. Odpověz POUZE českým názvem, nic jiného. Zachovej kulinářský styl.',
        },
        { role: 'user', content: title.trim().slice(0, 150) },
      ],
    });
    const raw = (completion.choices?.[0]?.message?.content || '').trim();
    const display_name_cs = raw && raw.length > 1 ? raw : '';
    titleCache.set(key, { display_name_cs, at: Date.now() });
    return display_name_cs;
  } catch {
    return '';
  }
}

/**
 * Lokalizuje celý recept (název, suroviny, postup).
 * @param {number} recipeId
 * @param {object} recipe - { title, extendedIngredients?, analyzedInstructions? }
 * @returns {Promise<{ display_name_cs: string, ingredients_cs: string[], instructions_cs: string[] }>}
 */
export async function getLocalizedRecipe(recipeId, recipe) {
  if (!recipeId || !recipe) {
    return {
      display_name_cs: 'Recept',
      ingredients_cs: [],
      instructions_cs: [],
    };
  }

  const cached = fullCache.get(recipeId);
  if (cached && isCacheFresh(cached)) return cached;

  const ingredients = recipe.extendedIngredients || recipe.ingredients || [];
  const instructions = [];
  if (Array.isArray(recipe.analyzedInstructions) && recipe.analyzedInstructions[0]?.steps) {
    instructions.push(...recipe.analyzedInstructions[0].steps.map((s) => s.step || '').filter(Boolean));
  } else if (typeof recipe.instructions === 'string' && recipe.instructions.trim()) {
    instructions.push(
      ...recipe.instructions
        .replace(/<[^>]+>/g, '')
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }

  const ingredientsRaw = ingredients
    .map((i) => i.original || (typeof i === 'string' ? i : `${i.amount ?? ''} ${i.unit ?? ''} ${i.name ?? ''}`.trim()))
    .filter(Boolean);

  let display_name_cs = 'Recept';
  let ingredients_cs = ingredientsRaw;
  let instructions_cs = instructions;

  if (process.env.OPENAI_API_KEY) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          {
            role: 'system',
            content: `Jsi překladatel receptů. Přelož do češtiny. Odpověz POUZE validním JSON:
{
  "display_name_cs": "český název receptu",
  "ingredients_cs": ["položka 1", "položka 2", ...],
  "instructions_cs": ["krok 1", "krok 2", ...]
}
Žádný úvod, žádný markdown. Zachovej množství a jednotky.`,
          },
          {
            role: 'user',
            content: `Název: ${recipe.title || ''}\nSuroviny: ${ingredientsRaw.slice(0, 15).join('; ')}\nPostup: ${instructions.slice(0, 8).join('; ')}`,
          },
        ],
        response_format: { type: 'json_object' },
      });
      const raw = completion.choices?.[0]?.message?.content;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.display_name_cs) display_name_cs = parsed.display_name_cs;
        if (Array.isArray(parsed.ingredients_cs) && parsed.ingredients_cs.length > 0) ingredients_cs = parsed.ingredients_cs;
        if (Array.isArray(parsed.instructions_cs) && parsed.instructions_cs.length > 0) instructions_cs = parsed.instructions_cs;
      }
    } catch {
      const t = await translateRecipeTitleToCzech(recipe.title, recipeId);
      display_name_cs = (t && String(t).trim()) ? String(t).trim() : (recipe.title || 'Recept');
    }
  }

  const result = { display_name_cs, ingredients_cs, instructions_cs, at: Date.now() };
  fullCache.set(recipeId, result);
  return result;
}
