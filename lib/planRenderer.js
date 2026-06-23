/**
 * lib/planRenderer.js
 * Renderuje HTML plán z jednotného strukturovaného JSON.
 * Jediný zdroj pravdy pro view layer: profil, e-mail, PlanViewer.
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md
 */

import { aggregateShoppingIngredientLinesFromStructuredPlan, aggregateShoppingByAisleFromStructuredPlan } from './spoonacularShopping';
import { mealDisplayTitleForStructuredMeal } from './mealDisplayNameHelpers';
import { portionIngredientsFromStructuredMeal } from './mealPortionIngredients';
import { getPublicAppUrl } from './siteUrls.js';
import { formatPlanDayHeadingLine } from './planDayHeadingFormat.js';
import { formatExerciseSetsRepsDisplay } from './planDataIntegrity.js';
import { recipeFromCatalogApiUrl, catalogLookupIdFromMeal } from './recipeDetailUrl.js';

const MEAL_TYPE_LABELS = {
  breakfast: 'Snídaně',
  lunch: 'Oběd',
  dinner: 'Večeře',
  snack: 'Svačina',
};

function escapeHtml(s) {
  if (s == null) return '';
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function planRecipeAppBaseUrl() {
  return getPublicAppUrl();
}

/**
 * Vygeneruje HTML plán ze strukturovaného JSON (výstup planOrchestrator.generateStructuredPlan).
 * Formát odpovídá očekávání parsePlanHtml, validatePlanHtml, sendPlanEmail.
 *
 * @param {object} planJson - { days, targets, valid_from, valid_until, _diagnostics?, ... }
 * @param {object} [bm] - body_metrics pro sekci Tvoje čísla (jméno, výška, váha, cíl, ...)
 * @returns {string} HTML plán
 */
export function renderPlanHtmlFromStructured(planJson, bm = null) {
  if (!planJson || typeof planJson !== 'object') return '';

  const sourcePlanHtml = typeof planJson.html === 'string' ? planJson.html : '';
  const days = planJson.days ?? [];
  const targets = planJson.targets ?? {};
  const calories = Number(targets.calories_per_day) || 2000;
  const protein = Number(targets.protein_g) || 120;
  const carbs = Number(targets.carbs_g) || 220;
  const fat = Number(targets.fat_g) || 65;

  const weight = bm?.weight_kg ?? 70;
  const height = bm?.height_cm ?? 175;
  const goalLabel = { redukce: 'Redukce', nabirani_svaly: 'Nabírání svalů', udrzovani: 'Udržování' }[bm?.goal] || 'Udržování';

  let html = '';

  // 1) Tvoje čísla
  html += `<h3>Tvoje čísla</h3>
<ul>
<li><strong>Výška:</strong> ${escapeHtml(String(height))} cm</li>
<li><strong>Váha:</strong> ${escapeHtml(String(weight))} kg</li>
<li><strong>Cíl:</strong> ${escapeHtml(goalLabel)}</li>
</ul>`;

  // 2) Denní cíle (makra)
  html += `<h3>Denní cíle</h3>
<ul>
<li><strong>Kalorie:</strong> ${calories} kcal</li>
<li><strong>Bílkoviny:</strong> ${protein} g</li>
<li><strong>Sacharidy:</strong> ${carbs} g</li>
<li><strong>Tuky:</strong> ${fat} g</li>
</ul>`;

  // 3) Mindset na tento týden (placeholder – structured plán nemá mindset z OpenAI)
  html += `<h3>Mindset na tento týden</h3>
<p>Drž se plánu, odpočívej mezi tréninky a dodržuj pitný režim.</p>`;

  // 4) Trénink – obecné zásady
  const workoutDaysCount = planJson.workouts_per_week ?? 0;
  html += `<h3>Tréninkový plán</h3>
<p>Tréninků týdně: <strong>${workoutDaysCount}</strong>. Níže u každého dne najdeš konkrétní cviky.</p>`;

  // 5) Jídelníček – 7 dní
  html += `<h3>Jídelníček (celý týden)</h3>`;

  for (const day of days) {
    const dayHeading = formatPlanDayHeadingLine(day.day_name, day.date);
    const dayName = day.day_name ?? day.date ?? 'Den';
    html += `<h4>${escapeHtml(dayHeading)}</h4>`;

    const meals = day.meals ?? [];
    let dayCal = 0;
    let dayProt = 0;
    let dayCarb = 0;
    let dayFat = 0;
    let dayFiber = 0;
    for (const m of meals) {
      const type = m.type ?? 'breakfast';
      const label = MEAL_TYPE_LABELS[type] ?? type;
      const text = mealDisplayTitleForStructuredMeal(m, sourcePlanHtml, dayName);
      const lookupId = catalogLookupIdFromMeal(m);
      const mealKey = (text || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
      let attrs = lookupId != null ? ` data-recipe-id="${escapeHtml(String(lookupId))}"` : '';
      attrs += mealKey ? ` data-meal-key="${escapeHtml(mealKey)}"` : '';
      const href =
        lookupId != null
          ? recipeFromCatalogApiUrl(lookupId, planRecipeAppBaseUrl(), { format: 'html', meal: m })
          : '';
      const titleEsc = escapeHtml(text || 'Zdravé jídlo');
      if (lookupId != null && href) {
        const aStyle =
          'color:#c4b5fd;font-weight:600;text-decoration:underline;text-underline-offset:2px;font-size:inherit;';
        html += `<p${attrs}><b>${escapeHtml(label)}:</b> <a class="spoonacular-recipe" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="${aStyle}">${titleEsc}</a></p>`;
      } else {
        html += `<p${attrs}><b>${escapeHtml(label)}:</b> ${titleEsc}</p>`;
      }
      const portions = portionIngredientsFromStructuredMeal(m);
      if (portions.length) {
        html += `<p class="meal-ingredient-portions-h" style="margin:6px 0 4px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">Suroviny na 1 porci (orientačně)</p><ul class="meal-ingredient-portions" style="margin:0 0 12px;padding-left:18px;color:#cbd5e1;font-size:12px;line-height:1.45;font-family:Arial,Helvetica,sans-serif;">`;
        for (const row of portions) {
          const amt =
            row.amountStr != null
              ? `<strong>${escapeHtml(row.amountStr)}${row.unit ? ` ${escapeHtml(row.unit)}` : ' g'}</strong>`
              : '';
          html += `<li style="margin:3px 0;">${escapeHtml(row.name)}${amt ? `: ${amt}` : ''}</li>`;
        }
        html += `</ul>`;
      }
      const r = m.recipe;
      if (r && m.recipe_verified === true) {
        if (r.calories != null) dayCal += Number(r.calories) || 0;
        if (r.protein_g != null) dayProt += Number(r.protein_g) || 0;
        if (r.carbs_g != null) dayCarb += Number(r.carbs_g) || 0;
        if (r.fat_g != null) dayFat += Number(r.fat_g) || 0;
        if (r.fiber_g != null) dayFiber += Number(r.fiber_g) || 0;
        const parts = [];
        if (r.calories != null) parts.push(`${Math.round(r.calories)} kcal`);
        if (r.protein_g != null) parts.push(`B ${Math.round(r.protein_g)} g`);
        if (r.carbs_g != null) parts.push(`S ${Math.round(r.carbs_g)} g`);
        if (r.fat_g != null) parts.push(`T ${Math.round(r.fat_g)} g`);
        if (r.fiber_g != null) parts.push(`Vláknina ${Math.round(r.fiber_g)} g`);
        if (r.ready_in_minutes != null) parts.push(`cca ${r.ready_in_minutes} min`);
        if (r.health_score != null) parts.push(`zdraví ${Math.round(r.health_score)}/100`);
        if (parts.length) {
          html += `<p class="meal-nutrition-line"><small>${escapeHtml(parts.join(' · '))}</small></p>`;
        }
      }
    }
    if (meals.length && (dayCal > 0 || dayProt > 0)) {
      const sum = [
        dayCal > 0 ? `Součet dne (orientačně): ${Math.round(dayCal)} kcal` : null,
        dayProt > 0 ? `B ${Math.round(dayProt)} g` : null,
        dayCarb > 0 ? `S ${Math.round(dayCarb)} g` : null,
        dayFat > 0 ? `T ${Math.round(dayFat)} g` : null,
        dayFiber > 0 ? `vláknina ${Math.round(dayFiber)} g` : null,
      ].filter(Boolean);
      if (sum.length) html += `<p><small><em>${escapeHtml(sum.join(', '))}</em></small></p>`;
    }

    // Trénink tento den
    const workout = day.workout;
    if (workout?.exercises?.length) {
      html += `<p><b>Trénink tento den:</b></p><ul>`;
      for (const ex of workout.exercises) {
        const name = ex.exercise_verified === true ? (ex.display_name_cs ?? 'Cvik') : 'Cvik — podrobnosti v aplikaci';
        const part = formatExerciseSetsRepsDisplay(ex);
        const exKey = ex.canonical_key ? ` data-exercise-key="${escapeHtml(ex.canonical_key)}"` : '';
        const wgerId =
          ex.wger_exercise_id != null && Number.isFinite(Number(ex.wger_exercise_id))
            ? ` data-wger-exercise-id="${escapeHtml(String(ex.wger_exercise_id))}"`
            : '';
        const imgUrl =
          ex.image_url && String(ex.image_url).trim()
            ? ` data-image-url="${escapeHtml(String(ex.image_url).trim())}"`
            : '';
        const gifUrl =
          ex.gif_url && String(ex.gif_url).trim()
            ? ` data-gif-url="${escapeHtml(String(ex.gif_url).trim())}"`
            : '';
        const videoUrl =
          ex.video_url && String(ex.video_url).trim()
            ? ` data-video-url="${escapeHtml(String(ex.video_url).trim())}"`
            : '';
        html += `<li${exKey}${wgerId}${imgUrl}${gifUrl}${videoUrl}>${escapeHtml(name)} – ${part}</li>`;
      }
      html += `</ul>`;
    } else {
      html += `<p><b>Trénink tento den:</b></p><ul><li>Odpočinek.</li></ul>`;
    }
  }

  // 6) Suplementace, Regenerace, Nákupní seznam
  html += `<h3>Suplementace</h3>
<ul>
<li>Vitamín D (doporučeno v zimních měsících)</li>
<li>Omega-3 (2–3× týdně)</li>
</ul>`;

  html += `<h3>Regenerace</h3>
<ul>
<li>Spánek 7–8 hodin</li>
<li>Protahování po tréninku</li>
<li>Dostatečný pitný režim</li>
</ul>`;

  const byAisle = aggregateShoppingByAisleFromStructuredPlan(planJson);
  const aisleKeys = Object.keys(byAisle).sort((a, b) => a.localeCompare(b, 'cs'));
  const shoppingLines = aggregateShoppingIngredientLinesFromStructuredPlan(planJson).slice(0, 80);
  html += `<h3>Nákupní seznam</h3>`;
  if (aisleKeys.length > 0) {
    html += `<p>Ingredience z ověřených receptů, přehledně podle oddílu v obchodě.</p>`;
    for (const aisle of aisleKeys) {
      const lines = (byAisle[aisle] || []).slice(0, 40);
      if (!lines.length) continue;
      html += `<p><strong>${escapeHtml(aisle)}</strong></p><ul>`;
      html += lines.map((i) => `<li>${escapeHtml(i)}</li>`).join('\n');
      html += `</ul>`;
    }
  } else if (shoppingLines.length === 0) {
    html += `<p>U tohoto plánu nemáme k dispozici kompletní nákupní seznam ingrediencí — u jednotlivých jídel najdeš podrobnosti v aplikaci.</p>`;
  } else {
    html += `<p>Suroviny sloučené z ověřených receptů. Seznam může být stručný — doplnění najdeš u jednotlivých jídel v aplikaci.</p>
<ul>
${shoppingLines.map((i) => `<li>${escapeHtml(i)}</li>`).join('\n')}
</ul>`;
  }

  return html;
}
