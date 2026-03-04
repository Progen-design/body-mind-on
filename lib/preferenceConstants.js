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

/**
 * Normalizuje aktivitu na canonical hodnotu (sedavy | stredne | velmi).
 * Přijímá interní kódy i české popisky. Pro Asistenta: sedavy = nízká, stredne = střední, velmi = vysoká.
 */
export function normalizeActivity(v) {
  if (!v || typeof v !== 'string') return null;
  const t = String(v).toLowerCase().trim();
  if (['sedavy', 'lehce', 'stredne', 'velmi', 'extra'].includes(t)) {
    return t === 'lehce' ? 'sedavy' : t === 'extra' ? 'velmi' : t;
  }
  if (t === 'nízká' || t === 'nizka' || (t.includes('nízk') && !t.includes('střed')) || t.includes('lehce') || t.includes('lehk')) return 'sedavy';
  if (t === 'střední' || t === 'stredni' || t.includes('střed')) return 'stredne';
  if (t === 'vysoká' || t === 'vysoka' || t.includes('vysok') || t.includes('extra')) return 'velmi';
  return 'stredne';
}

/**
 * Normalizuje stres na canonical hodnotu (low | medium | high).
 */
export function normalizeStress(v) {
  if (!v) return null;
  const t = String(v).toLowerCase().trim();
  if (['low', 'medium', 'high'].includes(t)) return t;
  if (t.includes('nízk')) return 'low';
  if (t.includes('střed')) return 'medium';
  if (t.includes('vysok')) return 'high';
  return 'medium';
}

/**
 * Normalizuje cíl na canonical hodnotu (redukce | nabirani_svaly | udrzovani).
 */
export function normalizeGoal(v) {
  if (!v || typeof v !== 'string') return null;
  const t = String(v).toLowerCase().trim();
  if (['redukce', 'nabirani_svaly', 'udrzovani'].includes(t)) return t;
  if (t.includes('reduk') || t.includes('hmotnosti')) return 'redukce';
  if (t.includes('sval') || t.includes('nárůst') || t.includes('narust')) return 'nabirani_svaly';
  if (t.includes('zdrav') || t.includes('udrž') || t.includes('udrz') || t.includes('životní') || t.includes('zivotni')) return 'udrzovani';
  return 'udrzovani';
}

/** Canonical hodnoty (shodné s option value ve formulářích): 1-2x týdně | 2-3x týdně | 4-5x týdně */
export function normalizeFrequency(v) {
  if (!v) return null;
  const t = String(v).toLowerCase();
  if (t.includes('1') && (t.includes('2') || t.includes('-') || t.includes('–') || t.includes('0'))) return '1-2x týdně';
  if (t.includes('2') && t.includes('3')) return '2-3x týdně';
  if (t.includes('4') || t.includes('5')) return '4-5x týdně';
  return '2-3x týdně';
}

/** Vrací číslo tréninků týdně (1 | 3 | 5) z freq_choice nebo textu. */
export function getWeeklySessions(v) {
  if (!v) return 3;
  const t = String(v).toLowerCase();
  if (t.includes('1')) return 1;
  if (t.includes('2')) return 3;
  if (t.includes('4')) return 5;
  return 3;
}
