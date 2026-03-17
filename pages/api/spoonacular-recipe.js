/**
 * GET /api/spoonacular-recipe?id=123
 * Fetches full recipe from Spoonacular by ID and returns HTML for the recipe modal.
 * Used when meal_trust has recipe_id (exact Spoonacular match) to avoid OpenAI fallback.
 */
const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_SPOONACULAR_HOST =
  process.env.RAPIDAPI_SPOONACULAR_HOST || 'spoonacular-recipe-food-nutrition-v1.p.rapidapi.com';
const API_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

function recipeToHtml(recipe) {
  if (!recipe) return '';
  const title = recipe.title || 'Recept';
  const servings = recipe.servings ? `Na ${recipe.servings} porcí` : '';

  let ingredientsHtml = '';
  const ingredients = recipe.extendedIngredients || recipe.ingredients || [];
  if (ingredients.length) {
    const items = ingredients
      .map((i) => {
        const raw = i.original || (typeof i === 'string' ? i : `${i.amount ?? ''} ${i.unit ?? ''} ${i.name ?? ''}`.trim());
        return raw ? escapeHtml(raw) : '';
      })
      .filter(Boolean);
    ingredientsHtml = '<p><b>Suroviny:</b></p><ul>' + items.map((s) => `<li>${s}</li>`).join('') + '</ul>';
  }

  let instructionsHtml = '';
  let instructions = recipe.instructions || '';
  if (Array.isArray(recipe.analyzedInstructions) && recipe.analyzedInstructions.length) {
    const steps = recipe.analyzedInstructions[0]?.steps || [];
    if (steps.length) {
      instructionsHtml = '<p><b>Postup:</b></p><ol>' + steps
        .map((s) => `<li>${escapeHtml(s.step || '')}</li>`)
        .join('') + '</ol>';
    }
  } else if (typeof instructions === 'string' && instructions.trim()) {
    instructionsHtml = '<p><b>Postup:</b></p>' + instructions
      .replace(/<[^>]+>/g, '')
      .split(/\n+/)
      .filter((s) => s.trim())
      .map((s, i) => `<p>${i + 1}. ${escapeHtml(s.trim())}</p>`)
      .join('');
  }

  return `<p><b>Jídlo:</b> ${escapeHtml(title)}${servings ? ` (${servings})` : ''}</p>${ingredientsHtml}${instructionsHtml}`.trim();
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

  const hasDirect = Boolean(SPOONACULAR_KEY);
  const hasRapid = Boolean(RAPIDAPI_KEY);
  if (!hasDirect && !hasRapid) {
    return res.status(503).json({ error: 'Spoonacular API není nakonfigurováno' });
  }

  let url = '';
  let headers = { Accept: 'application/json' };

  if (hasDirect) {
    url = `https://api.spoonacular.com/recipes/${recipeId}/information?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&includeNutrition=false`;
  } else {
    const host = RAPIDAPI_SPOONACULAR_HOST.replace(/^https?:\/\//, '');
    url = `https://${host}/recipes/${recipeId}/information?includeNutrition=false`;
    headers = {
      ...headers,
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': host,
    };
  }

  try {
    const resp = await fetchWithTimeout(url, { method: 'GET', headers });
    if (!resp.ok) {
      console.warn('[spoonacular-recipe] API error:', resp.status, await resp.text().catch(() => ''));
      return res.status(resp.status === 404 ? 404 : 502).json({ error: 'Recept se nepodařilo načíst' });
    }
    const recipe = await resp.json();
    const html = recipeToHtml(recipe);
    if (!html) {
      return res.status(502).json({ error: 'Recept nemá dostupná data' });
    }
    return res.status(200).json({ ok: true, html });
  } catch (err) {
    console.error('[spoonacular-recipe]', err.message || err);
    return res.status(500).json({ error: 'Recept se nepodařilo načíst' });
  }
}
