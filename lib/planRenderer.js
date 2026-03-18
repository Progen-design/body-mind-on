/**
 * lib/planRenderer.js
 * Renderuje HTML plán z jednotného strukturovaného JSON.
 * Jediný zdroj pravdy pro view layer: profil, e-mail, PlanViewer.
 * @see docs/ONBOARDING_PRODUCTION_SPEC.md
 */

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
  html += `<h3>Denní cíle (makra)</h3>
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
    const dayName = day.day_name ?? day.date ?? 'Den';
    html += `<h4>${escapeHtml(dayName)}</h4>`;

    const meals = day.meals ?? [];
    for (const m of meals) {
      const type = m.type ?? 'breakfast';
      const label = MEAL_TYPE_LABELS[type] ?? type;
      const text = m.recipe_verified === true ? (m.display_name_cs ?? 'Jídlo') : 'Jídlo (neověřeno)';
      const recipeId = m.recipe?.id ?? m.recipe_id ?? null;
      const mealKey = (text || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
      const attrs = recipeId ? ` data-recipe-id="${escapeHtml(String(recipeId))}"` : '';
      const keyAttr = mealKey ? ` data-meal-key="${escapeHtml(mealKey)}"` : '';
      html += `<p${attrs}${keyAttr}><b>${escapeHtml(label)}:</b> ${escapeHtml(text || '(jídlo)')}</p>`;
    }

    // Trénink tento den
    const workout = day.workout;
    if (workout?.exercises?.length) {
      html += `<p><b>Trénink tento den:</b></p><ul>`;
      for (const ex of workout.exercises) {
        const name = ex.exercise_verified === true ? (ex.display_name_cs ?? 'Cvik') : 'Cvik (neověřeno)';
        const sets = ex.sets ?? 3;
        const reps = ex.reps ?? '';
        const duration = ex.duration_sec;
        const part = reps ? `${sets}×${reps}` : duration ? `${Math.round(duration / 60)} min` : `${sets} sérií`;
        const exKey = ex.canonical_key ? ` data-exercise-key="${escapeHtml(ex.canonical_key)}"` : '';
        html += `<li${exKey}>${escapeHtml(name)} – ${part}</li>`;
      }
      html += `</ul>`;
    } else {
      html += `<p><b>Trénink tento den:</b></p><ul><li>Odpočinek.</li></ul>`;
    }
  }

  // 6) Suplementace, Regenerace, Nákupní seznam (placeholders pro kompatibilitu)
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

  const allMeals = days.flatMap((d) => d.meals ?? []).filter((m) => m.recipe_verified === true).map((m) => m.display_name_cs ?? 'Jídlo').filter(Boolean);
  const uniqueIngredients = [...new Set(allMeals)].slice(0, 15);
  const defaultShopping = ['Ovesné vločky', 'Vejce', 'Kuřecí prsa', 'Rýže', 'Zelenina', 'Ovoce', 'Ořechy', 'Řecký jogurt', 'Quinoa', 'Losos'];
  const shopping = uniqueIngredients.length >= 5 ? uniqueIngredients : [...uniqueIngredients, ...defaultShopping].slice(0, 15);
  html += `<h3>Nákupní seznam</h3>
<ul>
${shopping.map((i) => `<li>${escapeHtml(i)}</li>`).join('\n')}
</ul>`;

  return html;
}
