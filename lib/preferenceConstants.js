/**
 * Canonické hodnoty a normalizační funkce pro preference (aktivita, typ práce, cíl, …).
 * Jedna sada hodnot napříč formuláři a API.
 * Formuláře používají české popisky jako hodnoty; API normalizuje na interní kódy.
 */

/** Typ práce: pouze office_it | manual | teacher_sales (Sedavé | Aktivní | Kombinované). */
export const OCCUPATION_WHITELIST = ['office_it', 'manual', 'teacher_sales'];

/** Mapování interních kódů na 3 úrovně aktivity pro formulář preferencí (současný stav). */
export const ACTIVITY_LABELS = {
  sedavy: 'Nízká',
  lehce: 'Nízká',
  stredne: 'Střední',
  velmi: 'Vysoká',
  extra: 'Vysoká',
};
export const GOAL_LABELS = {
  redukce: 'Redukce hmotnosti',
  nabirani_svaly: 'Nárůst svalů',
  udrzovani: 'Zdravý životní styl',
};
export const OCCUPATION_LABELS = {
  office_it: 'Sedavé zaměstnání',
  manual: 'Aktivní zaměstnání',
  teacher_sales: 'Kombinované',
};

/**
 * Normalizuje hodnotu occupation na canonical hodnotu nebo null (pro API/DB).
 * Přijímá interní kódy i české popisky.
 */
export function normalizeOccupation(v) {
  if (!v || typeof v !== 'string') return null;
  const t = String(v).toLowerCase().trim();
  if (OCCUPATION_WHITELIST.includes(t)) return t;
  if (t === 'kombinovana' || t.includes('kombin') || t.includes('kombinované')) return 'teacher_sales';
  if (['driver', 'warehouse', 'healthcare', 'gastronomy', 'other'].includes(t)) return 'teacher_sales';
  if (t.includes('sedav') || t.includes('it') || t.includes('kancel')) return 'office_it';
  if (t.includes('aktivn') || t.includes('manu')) return 'manual';
  return 'teacher_sales';
}

/**
 * Normalizace pro předvyplnění formuláře: vrací český popisek pro select.
 * @param {string|null|undefined} v - vstupní hodnota z body_metrics (interní kód)
 * @returns {string} český popisek nebo ''
 */
export function normalizeOccupationForForm(v) {
  if (!v) return '';
  const t = String(v).toLowerCase().trim();
  if (OCCUPATION_WHITELIST.includes(t)) return OCCUPATION_LABELS[t] || '';
  if (t === 'kombinovana' || t.includes('kombin')) return OCCUPATION_LABELS.teacher_sales;
  return '';
}

/** Vrací český popisek aktivity pro formulář. */
export function activityToFormLabel(v) {
  if (!v) return '';
  const t = String(v).toLowerCase().trim();
  return ACTIVITY_LABELS[t] || '';
}

/** Vrací český popisek cíle pro formulář. */
export function goalToFormLabel(v) {
  if (!v) return '';
  const t = String(v).toLowerCase().trim();
  return GOAL_LABELS[t] || '';
}
