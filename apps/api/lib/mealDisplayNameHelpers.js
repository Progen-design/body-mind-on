/**
 * Parsování zobrazeného názvu jídla z HTML plánu (trainer / v6 raw.html).
 * Celotýdenní HTML používá bloky <h4>Den</h4> stejně jako renderPlanHtmlFromStructured.
 */
import { simplifyMealDisplayName } from './recipeSimplicityScore.js';

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

/** Nesmí se použít jako uživatelský název jídla (lokalizace / UI). */
export function isGenericUserMealLabel(s) {
  const t = (s || '').trim();
  return !t || t === 'Jídlo' || t === 'Jídlo (neověřeno)';
}

function trimUsableMealLabel(s) {
  const t = (typeof s === 'string' ? s : '').trim();
  return t && !isGenericUserMealLabel(t) ? t : '';
}

/**
 * Nápis jídla v plánu (HTML, e-mail, UI): u ověřeného receptu český název z plánovače (name_cs),
 * makra a suroviny ze Spoonacular; anglický `recipe.title` jen pokud český chybí.
 * @param {object|null|undefined} m – položka meals[] ze structured_plan_json
 * @param {string} [planHtml]
 * @param {string|null|undefined} [dayName]
 * @returns {string}
 */
export function mealDisplayTitleForStructuredMeal(m, planHtml = '', dayName = '') {
  // Catalog-backed meals: prefer recipe.title_cs (catalog truth) over slot/display_name.
  if (m?.catalog_id != null && String(m.catalog_id).trim() !== '') {
    const fromCatalog =
      trimUsableMealLabel(m?.recipe?.title_cs) ||
      trimUsableMealLabel(m?.display_name_cs) ||
      trimUsableMealLabel(m?.name_cs) ||
      '';
    if (fromCatalog) return fromCatalog.slice(0, 120);
  }
  if (m?.recipe_verified === true && m.recipe && typeof m.recipe === 'object') {
    const csTitle =
      trimUsableMealLabel(m?.display_name_cs) ||
      trimUsableMealLabel(m?.name_cs) ||
      trimUsableMealLabel(m?.recipe?.title_cs) ||
      '';
    if (csTitle) return simplifyMealDisplayName(csTitle, m?.type).slice(0, 120);
    const spoonTitle = trimUsableMealLabel(m.recipe.title);
    if (spoonTitle) return spoonTitle.slice(0, 120);
  }
  const fromPlanner =
    trimUsableMealLabel(m?.display_name_cs) ||
    trimUsableMealLabel(m?.name_cs) ||
    trimUsableMealLabel(m?.ai_name) ||
    '';
  if (fromPlanner) return simplifyMealDisplayName(fromPlanner, m?.type).slice(0, 120);
  const fromHtml = resolveTrainerMealDisplayLabel(m, planHtml || '', dayName);
  if (fromHtml) return fromHtml;
  const rest = trimUsableMealLabel(m?.display_name_cs) || trimUsableMealLabel(m?.display_name);
  if (rest) return rest.slice(0, 120);
  return 'Zdravé jídlo';
}

/**
 * Priorita zobrazení: name_cs → ai_name → text z HTML (nejprve blok dne, jinak první výskyt typu).
 * @param {object} m
 * @param {string} [planHtml]
 * @param {string|null|undefined} [dayName]
 * @returns {string}
 */
export function resolveTrainerMealDisplayLabel(m, planHtml, dayName) {
  const nc = (m?.name_cs || '').trim();
  if (nc && !isGenericUserMealLabel(nc)) return nc.slice(0, 120);
  const an = (m?.ai_name || '').trim();
  if (an && !isGenericUserMealLabel(an)) return an.slice(0, 120);
  if (planHtml && typeof planHtml === 'string') {
    const mt = m?.type || 'breakfast';
    let h = dayName ? extractMealNameFromPlanHtmlForDay(planHtml, dayName, mt) : null;
    if (!h) h = extractMealNameFromPlanHtml(planHtml, mt);
    const t = (h || '').trim();
    if (t && !isGenericUserMealLabel(t)) return t.slice(0, 120);
  }
  return '';
}
