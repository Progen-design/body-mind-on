/**
 * GET /api/spoonacular-recipe?id=123
 * Fetches full recipe from Spoonacular by ID and returns localized (Czech) HTML for the recipe modal.
 * Zahrnuje nutriční hodnoty (česky) s progress bary. Raw angličtina se nikdy nedostane do UI.
 */
const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY || '';
const API_TIMEOUT_MS = 10000;

/** České názvy živin – vždy česky, nikdy anglicky. */
const NUTRIENT_LABELS_CS = {
  Calories: 'Kalorie',
  Fat: 'Tuky',
  Protein: 'Bílkoviny',
  Carbohydrates: 'Sacharidy',
  Sugar: 'Cukry',
  Sodium: 'Sodík',
  'Vitamin A': 'Vitamin A',
  'Vitamin C': 'Vitamin C',
  Potassium: 'Draslík',
  Iron: 'Železo',
  'Saturated Fat': 'Nasycené tuky',
  Cholesterol: 'Cholesterol',
  Fiber: 'Vláknina',
  'Net Carbohydrates': 'Čisté sacharidy',
  Calcium: 'Vápník',
  Magnesium: 'Hořčík',
  'Vitamin D': 'Vitamin D',
  'Vitamin E': 'Vitamin E',
  'Vitamin K': 'Vitamin K',
  Zinc: 'Zinek',
  Phosphorus: 'Fosfor',
};

/** Makroživiny – růžový progress bar. */
const MACRO_NAMES = new Set(['Calories', 'Fat', 'Protein', 'Carbohydrates', 'Sugar', 'Saturated Fat', 'Fiber', 'Net Carbohydrates']);

function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

function getNutrientLabelCs(name) {
  if (!name || typeof name !== 'string') return 'Živina';
  const key = (name || '').trim();
  return NUTRIENT_LABELS_CS[key] || 'Živina';
}

function formatNutrientValue(amount, unit) {
  if (amount == null || amount === '') return '—';
  const num = Number(amount);
  if (Number.isNaN(num)) return String(amount);
  if (num === Math.floor(num)) return `${num} ${unit || ''}`.trim();
  return `${num.toFixed(1)} ${unit || ''}`.trim();
}

function buildNutritionHtml(nutrients) {
  if (!Array.isArray(nutrients) || nutrients.length === 0) return '';
  const priority = ['Calories', 'Fat', 'Protein', 'Carbohydrates', 'Sugar', 'Sodium', 'Vitamin A', 'Vitamin C', 'Potassium', 'Iron'];
  const seen = new Set();
  const ordered = [];
  for (const key of priority) {
    const n = nutrients.find((x) => (x.name || '').toLowerCase() === key.toLowerCase());
    if (n && !seen.has(key)) {
      seen.add(key);
      ordered.push(n);
    }
  }
  for (const n of nutrients) {
    const k = (n.name || '').trim();
    if (k && !seen.has(k)) {
      seen.add(k);
      ordered.push(n);
    }
  }
  const rows = ordered.map((n) => {
    const label = getNutrientLabelCs(n.name);
    const value = formatNutrientValue(n.amount, n.unit);
    const pct = n.percentOfDailyNeeds != null ? Math.min(100, Math.round(Number(n.percentOfDailyNeeds))) : 0;
    const isMacro = MACRO_NAMES.has(n.name);
    const barClass = isMacro ? 'recipe-nutrient-bar-macro' : 'recipe-nutrient-bar-micro';
    return `<div class="recipe-nutrient-row" style="margin-bottom:10px;"><div class="recipe-nutrient-top" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;width:100%;box-sizing:border-box;"><span class="recipe-nutrient-label" style="flex:1 1 120px;min-width:0;">${escapeHtml(label)}</span><span class="recipe-nutrient-value" style="white-space:nowrap;font-weight:600;color:#e2e8f0;">${escapeHtml(value)}</span><span class="recipe-nutrient-pct" style="white-space:nowrap;color:#94a3b8;font-size:12px;">${pct}%</span></div><div class="recipe-nutrient-bar-wrap"><div class="recipe-nutrient-bar ${barClass}" style="width:${pct}%"></div></div></div>`;
  });
  return `<div class="recipe-nutrition-block"><h4 class="recipe-nutrition-title">Nutriční hodnoty na 1 porci</h4><div class="recipe-nutrients">${rows.join('')}</div></div>`;
}

function rawIngredientLinesFromRecipe(recipe) {
  const ingredients = recipe?.extendedIngredients || recipe?.ingredients || [];
  return ingredients
    .map((i) =>
      i?.original || (typeof i === 'string' ? i : `${i.amount ?? ''} ${i.unit ?? ''} ${i.name ?? ''}`.trim())
    )
    .filter(Boolean);
}

/**
 * HTML pro modal: nejdřív suroviny a postup (to uživatel hledá), nutriční tabulka až na závěr.
 * @param {string} [spoonacularTitle] – anglický název z API, když chybí český překlad názvu
 */
function recipeToLocalizedHtml(localized, nutrition = null, spoonacularTitle = '') {
  if (!localized) return '';
  const { display_name_cs, ingredients_cs, instructions_cs } = localized;
  const title =
    (display_name_cs && String(display_name_cs).trim() && display_name_cs !== 'Recept')
      ? display_name_cs
      : (spoonacularTitle && String(spoonacularTitle).trim()) || 'Recept';

  let ingredientsHtml = '';
  const ingList = Array.isArray(ingredients_cs) && ingredients_cs.length > 0 ? ingredients_cs : [];
  if (ingList.length > 0) {
    ingredientsHtml = '<p><b>Suroviny:</b></p><ul>' + ingList.map((s) => `<li>${escapeHtml(String(s))}</li>`).join('') + '</ul>';
  }

  let instructionsHtml = '';
  if (Array.isArray(instructions_cs) && instructions_cs.length > 0) {
    instructionsHtml = '<p><b>Postup:</b></p><ol>' + instructions_cs.map((s) => `<li>${escapeHtml(String(s))}</li>`).join('') + '</ol>';
  }

  const nutritionHtml = buildNutritionHtml(nutrition?.nutrients || []);
  const parts = [
    `<p><b>Jídlo:</b> ${escapeHtml(title)}</p>`,
    ingredientsHtml,
    instructionsHtml,
    nutritionHtml,
  ].filter(Boolean);
  return parts.join('').trim();
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

  const url = `https://api.spoonacular.com/recipes/${recipeId}/information?apiKey=${encodeURIComponent(SPOONACULAR_KEY)}&includeNutrition=true`;

  try {
    const resp = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      console.warn('[spoonacular-recipe] API error:', resp.status, await resp.text().catch(() => ''));
      return res.status(resp.status === 404 ? 404 : 502).json({ error: 'Recept se nepodařilo načíst' });
    }
    const recipe = await resp.json();
    const { getLocalizedRecipe } = await import('../../lib/recipeLocalization');
    const localized = await getLocalizedRecipe(recipeId, recipe);
    const rawIng = rawIngredientLinesFromRecipe(recipe);
    const ingredients_cs =
      Array.isArray(localized.ingredients_cs) && localized.ingredients_cs.length > 0
        ? localized.ingredients_cs
        : rawIng;
    const merged = { ...localized, ingredients_cs };
    const nutrition = recipe?.nutrition || null;
    const html = recipeToLocalizedHtml(merged, nutrition, recipe?.title || '');
    if (!html) {
      return res.status(502).json({ error: 'Recept nemá dostupná data' });
    }
    return res.status(200).json({ ok: true, html });
  } catch (err) {
    console.error('[spoonacular-recipe]', err.message || err);
    return res.status(500).json({ error: 'Recept se nepodařilo načíst' });
  }
}
