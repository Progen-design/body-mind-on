/**
 * GET /api/spoonacular-recipe?id=123
 * Fetches full recipe from Spoonacular by ID and returns localized (Czech) HTML for the recipe modal.
 * Raw angličtina se nikdy nedostane do UI – vždy lokalizováno.
 */
const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';
const API_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

function recipeToLocalizedHtml(localized) {
  if (!localized) return '';
  const { display_name_cs, ingredients_cs, instructions_cs } = localized;
  const title = display_name_cs || 'Recept';

  let ingredientsHtml = '';
  if (Array.isArray(ingredients_cs) && ingredients_cs.length > 0) {
    ingredientsHtml = '<p><b>Suroviny:</b></p><ul>' + ingredients_cs.map((s) => `<li>${escapeHtml(String(s))}</li>`).join('') + '</ul>';
  }

  let instructionsHtml = '';
  if (Array.isArray(instructions_cs) && instructions_cs.length > 0) {
    instructionsHtml = '<p><b>Postup:</b></p><ol>' + instructions_cs.map((s) => `<li>${escapeHtml(String(s))}</li>`).join('') + '</ol>';
  }

  return `<p><b>Jídlo:</b> ${escapeHtml(title)}</p>${ingredientsHtml}${instructionsHtml}`.trim();
}

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Pouze GET' });
  }

  const id = (req.query.id || '').trim();
  const recipeId = /^\d+$/.test(id) ? parseInt(id, 10) : null;
  if (!recipeId) {
    return res.status(400).json({ error: 'Parametr id musí být číslo (Spoonacular recipe ID)' });
  }

  if (!SPOONACULAR_KEY) {
    return res.status(503).json({ error: 'Spoonacular API není nakonfigurováno (SPOONACULAR_API_KEY)' });
  }

  const url = `https://api.spoonacular.com/recipes/${recipeId}/information?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&includeNutrition=false`;

  try {
    const resp = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      console.warn('[spoonacular-recipe] API error:', resp.status, await resp.text().catch(() => ''));
      return res.status(resp.status === 404 ? 404 : 502).json({ error: 'Recept se nepodařilo načíst' });
    }
    const recipe = await resp.json();
    const { getLocalizedRecipe } = await import('../../lib/recipeLocalization');
    const localized = await getLocalizedRecipe(recipeId, recipe);
    const html = recipeToLocalizedHtml(localized);
    if (!html) {
      return res.status(502).json({ error: 'Recept nemá dostupná data' });
    }
    return res.status(200).json({ ok: true, html });
  } catch (err) {
    console.error('[spoonacular-recipe]', err.message || err);
    return res.status(500).json({ error: 'Recept se nepodařilo načíst' });
  }
}
