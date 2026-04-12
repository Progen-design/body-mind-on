/**
 * Parsování zobrazeného názvu jídla z HTML plánu (trainer / v6 raw.html).
 * Celotýdenní HTML používá bloky <h4>Den</h4> stejně jako renderPlanHtmlFromStructured.
 */

const MEAL_TYPE_LABELS = {
  breakfast: 'Snídaně',
  lunch: 'Oběd',
  dinner: 'Večeře',
  snack: 'Svačina',
};

/**
 * První výskyt <b>Snídaně:</b> text v daném HTML úryvku (vhodné pro jeden den nebo jednu sekci).
 * @param {string|null|undefined} planHtml
 * @param {string} mealType breakfast | lunch | dinner | snack
 * @returns {string|null}
 */
export function extractMealNameFromPlanHtml(planHtml, mealType) {
  if (!planHtml || typeof planHtml !== 'string') return null;
  const label = MEAL_TYPE_LABELS[mealType] || MEAL_TYPE_LABELS.breakfast;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<b>\\s*${escaped}\\s*:\\s*<\\/b>\\s*([^<\\n]+)`, 'i');
  const m = planHtml.match(re);
  const text = m?.[1]?.replace(/\s+/g, ' ')?.trim()?.slice(0, 120);
  return text || null;
}

/**
 * Název jídla z celého týdenního HTML: nejdřív sekce <h4>dayName</h4>…, pak štítek typu jídla.
 * @param {string|null|undefined} planHtml
 * @param {string|null|undefined} dayNameCzech např. Pondělí
 * @param {string} mealType
 * @returns {string|null}
 */
export function extractMealNameFromPlanHtmlForDay(planHtml, dayNameCzech, mealType) {
  if (!planHtml || typeof planHtml !== 'string' || !dayNameCzech) return null;
  const escaped = String(dayNameCzech).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blockRe = new RegExp(
    `<h4[^>]*>\\s*${escaped}[^<]*</h4>([\\s\\S]*?)(?=<h4[^>]*>|$)`,
    'i'
  );
  const blockMatch = planHtml.trim().match(blockRe);
  if (!blockMatch?.[1]) return null;
  return extractMealNameFromPlanHtml(blockMatch[1], mealType);
}
