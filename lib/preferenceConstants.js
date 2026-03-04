/**
 * Canonické hodnoty a normalizační funkce pro preference (aktivita, typ práce, cíl, …).
 * Jedna sada hodnot napříč formuláři a API.
 */

/** Typ práce: pouze office_it | manual | teacher_sales (Sedavé | Aktivní | Kombinované). */
export const OCCUPATION_WHITELIST = ['office_it', 'manual', 'teacher_sales'];

/**
 * Normalizuje hodnotu occupation na canonical hodnotu nebo null (pro API/DB).
 * @param {string|null|undefined} v - vstupní hodnota
 * @returns {string|null} office_it | manual | teacher_sales | null
 */
export function normalizeOccupation(v) {
  if (!v) return null;
  const t = String(v).toLowerCase().trim();
  if (OCCUPATION_WHITELIST.includes(t)) return t;
  if (t === 'kombinovana' || t.includes('kombin')) return 'teacher_sales';
  if (['driver', 'warehouse', 'healthcare', 'gastronomy', 'other'].includes(t)) return 'teacher_sales';
  if (t.includes('it') || t.includes('kancel')) return 'office_it';
  if (t.includes('manu')) return 'manual';
  return 'teacher_sales';
}

/**
 * Normalizace pro předvyplnění formuláře: vrací hodnotu pouze pro naše 3 optiony.
 * Pro staré hodnoty (driver, warehouse, …) vrací '' → zobrazí se „Vyber".
 * @param {string|null|undefined} v - vstupní hodnota z body_metrics
 * @returns {string} office_it | manual | teacher_sales | ''
 */
export function normalizeOccupationForForm(v) {
  if (!v) return '';
  const t = String(v).toLowerCase().trim();
  if (OCCUPATION_WHITELIST.includes(t)) return t;
  if (t === 'kombinovana' || t.includes('kombin')) return 'teacher_sales';
  return '';
}
