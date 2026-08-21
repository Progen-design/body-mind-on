/** Sdílené HTML pro detail receptu (modal + e-mailový odkaz). */

import {
  getMacroEnergyBreakdown,
  getMacroCalorieDelta,
  normalizeMacroNutritionFields,
} from './macroNutrition.js';

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

/** Czech portion heading for modal / nutrition block. */
export function portionServingLabelCs(portionMultiplier) {
  const m = Number(portionMultiplier);
  if (!Number.isFinite(m) || Math.abs(m - 1) < 0.05) return 'Na 1 porci';
  const nice = Math.abs(m - Math.round(m)) < 0.05
    ? String(Math.round(m))
    : String(Math.round(m * 10) / 10);
  return `Podle tvé porce v plánu (×${nice})`;
}

export function nutritionTitleForPortion(portionMultiplier) {
  const m = Number(portionMultiplier);
  if (!Number.isFinite(m) || Math.abs(m - 1) < 0.05) return 'Nutriční hodnoty na 1 porci';
  return 'Nutriční hodnoty podle tvé porce v plánu';
}

function resolvePortionMultiplier(macrosInput) {
  if (!macrosInput || typeof macrosInput !== 'object') return 1;
  const candidates = [
    macrosInput.portion_multiplier,
    macrosInput.normalizedMeal?.portion_multiplier,
    macrosInput.normalizedMeal?.recipe?.portion_multiplier,
    macrosInput.recipe?.portion_multiplier,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}

function formatNutrientValue(amount, unit) {
  if (amount == null || amount === '') return '—';
  const num = Number(amount);
  if (Number.isNaN(num)) return String(amount);
  if (num === Math.floor(num)) return `${num} ${unit || ''}`.trim();
  return `${num.toFixed(1)} ${unit || ''}`.trim();
}

export function buildNutritionHtml(nutrients, portionMultiplier = 1) {
  if (!Array.isArray(nutrients) || nutrients.length === 0) return '';
  const title = nutritionTitleForPortion(portionMultiplier);
  const rows = nutrients.map((n) => {
    const label = getNutrientLabelCs(n.name);
    const value = formatNutrientValue(n.amount, n.unit);
    const pct = n.percentOfDailyNeeds != null ? Math.min(100, Math.round(Number(n.percentOfDailyNeeds))) : 0;
    const isMacro = MACRO_NAMES.has(n.name);
    const barClass = isMacro ? 'recipe-nutrient-bar-macro' : 'recipe-nutrient-bar-micro';
    return `<div class="recipe-nutrient-row" style="margin-bottom:10px;"><div class="recipe-nutrient-top" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;width:100%;box-sizing:border-box;"><span class="recipe-nutrient-label" style="flex:1 1 120px;min-width:0;">${escapeHtml(label)}</span><span class="recipe-nutrient-value" style="white-space:nowrap;font-weight:600;color:#e2e8f0;">${escapeHtml(value)}</span><span class="recipe-nutrient-pct" style="white-space:nowrap;color:#94a3b8;font-size:12px;">${pct}%</span></div><div class="recipe-nutrient-bar-wrap"><div class="recipe-nutrient-bar ${barClass}" style="width:${pct}%"></div></div></div>`;
  });
  return `<div class="recipe-nutrition-block"><h4 class="recipe-nutrition-title">${escapeHtml(title)}</h4><div class="recipe-nutrients">${rows.join('')}</div></div>`;
}

/**
 * Makro blok s energií % (4/4/9) — pro local START / profile modal.
 * @param {object} macrosInput display model nebo meal object
 * @returns {string}
 */
export function buildMacroEnergyNutritionHtml(macrosInput) {
  const { kcal, protein_g, carbs_g, fat_g } = normalizeMacroNutritionFields(macrosInput);
  const breakdown = getMacroEnergyBreakdown({ kcal, protein_g, carbs_g, fat_g });
  const displayKcal = breakdown.statedKcal ?? (breakdown.totalMacroKcal > 0 ? breakdown.totalMacroKcal : null);
  const portionMult = resolvePortionMultiplier(macrosInput);
  const title = nutritionTitleForPortion(portionMult);

  if (!breakdown.hasMacros) {
    if (displayKcal) {
      return `<div class="recipe-nutrition-block"><h4 class="recipe-nutrition-title">${escapeHtml(title)}</h4><p class="recipe-macro-kcal-line"><span class="recipe-macro-kcal-label">Kalorie</span> <strong>${escapeHtml(String(displayKcal))} kcal</strong></p><p class="recipe-macro-unavailable">Makra pro toto jídlo nejsou dostupná.</p></div>`;
    }
    return `<div class="recipe-nutrition-block"><h4 class="recipe-nutrition-title">${escapeHtml(title)}</h4><p class="recipe-macro-unavailable">Makra pro toto jídlo nejsou dostupná.</p></div>`;
  }

  const delta = getMacroCalorieDelta(displayKcal ?? breakdown.totalMacroKcal, protein_g, carbs_g, fat_g);
  const statusNote = delta.status === 'ERROR'
    ? '<p class="recipe-macro-kcal-error" style="margin:10px 0 0;font-size:12px;color:#fca5a5;line-height:1.4;">Kalorie a makra se u tohoto jídla neshodují. Ber hodnoty jako orientační.</p>'
    : delta.status === 'WARNING'
    ? '<p class="recipe-macro-kcal-warning" style="margin:10px 0 0;font-size:12px;color:#fcd34d;line-height:1.4;">Kalorie jsou zaokrouhlené podle porcí.</p>'
    : '';

  const stackedBarStyle = 'display:flex;height:8px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,0.1);width:100%;max-width:100%;margin:12px 0 14px;box-sizing:border-box;';
  const segBaseStyle = 'display:block;height:100%;min-width:2px;';
  const stackedBar = `
    <div class="recipe-macro-energy-bar" role="img" aria-label="Poměr maker z kalorií" style="${stackedBarStyle}">
      ${breakdown.proteinPercent > 0 ? `<span class="recipe-macro-energy-seg recipe-macro-energy-seg--protein" style="${segBaseStyle}width:${breakdown.proteinPercent}%;background:#f472b6;"></span>` : ''}
      ${breakdown.carbsPercent > 0 ? `<span class="recipe-macro-energy-seg recipe-macro-energy-seg--carbs" style="${segBaseStyle}width:${breakdown.carbsPercent}%;background:#60a5fa;"></span>` : ''}
      ${breakdown.fatPercent > 0 ? `<span class="recipe-macro-energy-seg recipe-macro-energy-seg--fat" style="${segBaseStyle}width:${breakdown.fatPercent}%;background:#fbbf24;"></span>` : ''}
    </div>`;

  const barWrapStyle = 'height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;width:100%;';
  const barColors = {
    protein: '#f472b6',
    carbs: '#60a5fa',
    fat: '#fbbf24',
  };
  const macroRows = [
    { key: 'protein', label: 'Bílkoviny', grams: protein_g, pct: breakdown.proteinPercent, barClass: 'recipe-macro-energy-seg--protein', color: barColors.protein },
    { key: 'carbs', label: 'Sacharidy', grams: carbs_g, pct: breakdown.carbsPercent, barClass: 'recipe-macro-energy-seg--carbs', color: barColors.carbs },
    { key: 'fat', label: 'Tuky', grams: fat_g, pct: breakdown.fatPercent, barClass: 'recipe-macro-energy-seg--fat', color: barColors.fat },
  ].map((row) => {
    const value = `${Math.round(row.grams)} g`;
    const barStyle = `display:block;height:100%;border-radius:3px;width:${row.pct}%;background:${row.color};min-width:2px;`;
    return `<div class="recipe-nutrient-row recipe-macro-energy-row" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;"><div class="recipe-nutrient-top" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;font-size:13px;width:100%;"><span class="recipe-nutrient-label" style="color:#cbd5e1;">${escapeHtml(row.label)}</span><span class="recipe-nutrient-value" style="color:#94a3b8;font-weight:500;">${escapeHtml(value)} · ${row.pct} %</span></div><div class="recipe-nutrient-bar-wrap" style="${barWrapStyle}"><div class="recipe-nutrient-bar recipe-nutrient-bar-macro ${row.barClass}" style="${barStyle}"></div></div></div>`;
  }).join('');

  const kcalLine = displayKcal
    ? `<p class="recipe-macro-kcal-line"><span class="recipe-macro-kcal-label">Kalorie</span> <strong>${escapeHtml(String(displayKcal))} kcal</strong></p>`
    : '';

  return `<div class="recipe-nutrition-block"><h4 class="recipe-nutrition-title">${escapeHtml(title)}</h4>${kcalLine}${stackedBar}<div class="recipe-nutrients recipe-nutrients--macro-energy">${macroRows}</div>${statusNote}</div>`;
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
    .recipe-macro-energy-bar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,0.1);width:100%;max-width:100%;margin:12px 0 14px;box-sizing:border-box;}
    .recipe-macro-energy-seg{display:block;height:100%;min-width:2px;}
    .recipe-macro-energy-seg--protein{background:#f472b6;}
    .recipe-macro-energy-seg--carbs{background:#60a5fa;}
    .recipe-macro-energy-seg--fat{background:#fbbf24;}
    .recipe-macro-kcal-line{margin:0 0 8px;font-size:15px;color:#e2e8f0;}
    .recipe-macro-kcal-label{color:#94a3b8;margin-right:6px;}
    .recipe-macro-unavailable{margin:8px 0 0;color:#94a3b8;font-size:13px;}
    .recipe-macro-kcal-warning{margin:10px 0 0;font-size:12px;color:#fcd34d;line-height:1.4;}
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
