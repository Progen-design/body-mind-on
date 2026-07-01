/**
 * Datum narození a výpočet věku (bez DB sloupce birth_date — user_metadata + body_metrics.age).
 */

/**
 * @param {string|null|undefined} birthDateIso YYYY-MM-DD
 * @returns {number|null}
 */
export function calculateAgeFromBirthDate(birthDateIso, refDate = new Date()) {
  const raw = String(birthDateIso || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return null;
  const ref = refDate instanceof Date ? refDate : new Date(refDate);
  let age = ref.getFullYear() - y;
  const monthDiff = ref.getMonth() + 1 - m;
  const dayDiff = ref.getDate() - d;
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}

/**
 * @param {string|null|undefined} birthDateIso
 * @returns {{ valid: boolean, error?: string, age?: number }}
 */
export function validateBirthDate(birthDateIso, refDate = new Date()) {
  const raw = String(birthDateIso || '').trim();
  if (!raw) return { valid: false, error: 'Zadej datum narození.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { valid: false, error: 'Datum narození musí být ve formátu RRRR-MM-DD.' };
  }
  const date = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, error: 'Neplatné datum narození.' };
  }
  const ref = refDate instanceof Date ? refDate : new Date(refDate);
  if (date > ref) {
    return { valid: false, error: 'Datum narození nesmí být v budoucnosti.' };
  }
  const age = calculateAgeFromBirthDate(raw, ref);
  if (age == null || age < 13 || age > 90) {
    return { valid: false, error: 'Věk musí být mezi 13 a 90 lety.' };
  }
  return { valid: true, age };
}

/**
 * @param {number|null|undefined} age
 * @returns {string|null} approximate YYYY-MM-DD for prefilling (1. 1.)
 */
export function approximateBirthDateFromAge(age, refDate = new Date()) {
  const a = Number(age);
  if (!Number.isFinite(a) || a < 13 || a > 90) return null;
  const ref = refDate instanceof Date ? refDate : new Date(refDate);
  const year = ref.getFullYear() - Math.round(a);
  return `${year}-01-01`;
}
