/** Sdílené HTML pro detail receptu (modal + e-mailový odkaz). */

const NUTRIENT_LABELS_CS = {
  Calories: 'Kalorie',
  Fat: 'Tuky',
  Protein: 'Bílkoviny',
  Carbohydrates: 'Sacharidy',
  Sugar: 'Cukry',
  Sodium: 'Sodík',
  Fiber: 'Vláknina',
};

const MACRO_NAMES = new Set(['Calories', 'Fat', 'Protein', 'Carbohydrates', 'Sugar', 'Fiber']);

export function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getNutrientLabelCs(name) {
  const key = String(name || '').trim();
  return NUTRIENT_LABELS_CS[key] || key || 'Živina';
}

function formatNutrientValue(amount, unit) {
  if (amount == null || amount === '') return '—';
  const num = Number(amount);
  if (Number.isNaN(num)) return String(amount);
  if (num === Math.floor(num)) return `${num} ${unit || ''}`.trim();
  return `${num.toFixed(1)} ${unit || ''}`.trim();
}

export function buildNutritionHtml(nutrients) {
  if (!Array.isArray(nutrients) || nutrients.length === 0) return '';
  const rows = nutrients.map((n) => {
    const label = getNutrientLabelCs(n.name);
    const value = formatNutrientValue(n.amount, n.unit);
    const pct = n.percentOfDailyNeeds != null ? Math.min(100, Math.round(Number(n.percentOfDailyNeeds))) : 0;
    const isMacro = MACRO_NAMES.has(n.name);
    const barClass = isMacro ? 'recipe-nutrient-bar-macro' : 'recipe-nutrient-bar-micro';
    return `<div class="recipe-nutrient-row" style="margin-bottom:10px;"><div class="recipe-nutrient-top" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;width:100%;box-sizing:border-box;"><span class="recipe-nutrient-label" style="flex:1 1 120px;min-width:0;">${escapeHtml(label)}</span><span class="recipe-nutrient-value" style="white-space:nowrap;font-weight:600;color:#e2e8f0;">${escapeHtml(value)}</span><span class="recipe-nutrient-pct" style="white-space:nowrap;color:#94a3b8;font-size:12px;">${pct}%</span></div><div class="recipe-nutrient-bar-wrap"><div class="recipe-nutrient-bar ${barClass}" style="width:${pct}%"></div></div></div>`;
  });
  return `<div class="recipe-nutrition-block"><h4 class="recipe-nutrition-title">Nutriční hodnoty na 1 porci</h4><div class="recipe-nutrients">${rows.join('')}</div></div>`;
}

export function recipeImageHtml(imageUrl, altTitle) {
  const url = String(imageUrl || '').trim();
  if (!url) return '';
  const safeAlt = escapeHtml(String(altTitle || 'Recept').trim() || 'Recept');
  return `<p class="recipe-detail-image-wrap" style="margin:0 0 16px;"><img class="recipe-detail-image" src="${escapeHtml(url)}" alt="${safeAlt}" loading="lazy" style="max-width:100%;max-height:280px;border-radius:12px;object-fit:cover;display:block;" /></p>`;
}

export function recipePartsToHtml({ title, ingredients_cs, instructions_cs, image_url, nutritionHtml }) {
  const safeTitle = String(title || 'Recept').trim() || 'Recept';
  const imageHtml = recipeImageHtml(image_url, safeTitle);

  let ingredientsHtml = '';
  const ingList = Array.isArray(ingredients_cs) ? ingredients_cs.filter(Boolean) : [];
  if (ingList.length > 0) {
    ingredientsHtml = '<p><b>Suroviny:</b></p><ul>' + ingList.map((s) => `<li>${escapeHtml(String(s))}</li>`).join('') + '</ul>';
  }

  let instructionsHtml = '';
  const steps = Array.isArray(instructions_cs) ? instructions_cs.filter(Boolean) : [];
  if (steps.length > 0) {
    instructionsHtml = '<p><b>Postup:</b></p><ol>' + steps.map((s) => `<li>${escapeHtml(String(s))}</li>`).join('') + '</ol>';
  }

  const parts = [
    imageHtml,
    `<p><b>Jídlo:</b> ${escapeHtml(safeTitle)}</p>`,
    ingredientsHtml,
    instructionsHtml,
    nutritionHtml || '',
  ].filter(Boolean);
  return parts.join('').trim();
}

export function wantsHtmlDocument(req) {
  if (String(req.query.format || '').toLowerCase() === 'html') return true;
  const accept = String(req.headers.accept || '').toLowerCase();
  return /\btext\/html\b/.test(accept);
}

export function wrapRecipeHtmlDocument(title, bodyHtml) {
  const safeTitle = escapeHtml((title || 'Recept').trim() || 'Recept');
  const styles = `
    body{margin:0;padding:24px 18px 40px;background:#0f0f1a;color:#e2e8f0;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;line-height:1.55;font-size:15px;}
    .recipe-wrap{max-width:640px;margin:0 auto;}
    .recipe-back{display:inline-block;margin-bottom:18px;font-size:13px;font-weight:600;color:#a78bfa;text-decoration:none;}
    .recipe-back:hover{text-decoration:underline;}
    h1{font-size:1.35rem;font-weight:700;color:#f8fafc;margin:0 0 20px;line-height:1.25;}
    .recipe-body b{color:#e9d5ff;}
    .recipe-body p{margin:12px 0;}
    .recipe-body ul,.recipe-body ol{margin:8px 0;padding-left:22px;}
    .recipe-body li{margin:6px 0;}
    .recipe-body .recipe-detail-image{max-width:100%;max-height:320px;border-radius:12px;object-fit:cover;display:block;margin:0 0 20px;}
    .recipe-nutrition-block{margin:20px 0;padding:14px 16px;background:rgba(255,255,255,0.05);border-radius:12px;border:1px solid rgba(255,255,255,0.08);}
    .recipe-nutrition-title{margin:0 0 12px;font-size:14px;font-weight:600;color:#e9d5ff;}
    .recipe-nutrient-bar-wrap{height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;}
    .recipe-nutrient-bar{height:100%;border-radius:3px;}
    .recipe-nutrient-bar-macro{background:linear-gradient(90deg,#ec4899,#f472b6);}
    .recipe-nutrient-bar-micro{background:linear-gradient(90deg,#3b82f6,#60a5fa);}
  `;
  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle} – Body &amp; Mind ON</title>
  <style>${styles}</style>
</head>
<body>
  <div class="recipe-wrap">
    <a class="recipe-back" href="/profil">← Zpět do aplikace</a>
    <h1>${safeTitle}</h1>
    <div class="recipe-body">${bodyHtml}</div>
  </div>
</body>
</html>`;
}

export function respondRecipeError(req, res, httpStatus, messageCs) {
  const msg = String(messageCs || 'Recept se nepodařilo načíst').trim();
  const body = `<p><strong>${escapeHtml(msg)}</strong></p><p>V aplikaci otevři plán na <a href="/profil" style="color:#a78bfa;">profilu</a> a použij tlačítko „Recept“ u jídla.</p>`;
  if (wantsHtmlDocument(req)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(httpStatus).send(wrapRecipeHtmlDocument('Recept', body));
  }
  return res.status(httpStatus).json({ ok: false, error: msg });
}
