/**
 * Jednotný text hlavičky dne pro HTML plán a e-mail (den + datum v češtině).
 */

import { addCalendarDaysIsoPrague } from './czechCalendar';

/**
 * @param {string|null|undefined} dayName
 * @param {string|null|undefined} isoDateYmd – YYYY-MM-DD nebo ISO řetězec
 */
export function formatPlanDayHeadingLine(dayName, isoDateYmd) {
  const iso = String(isoDateYmd || '').replace(/T.*/, '').slice(0, 10);
  let dateCs = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    dateCs = `${d}. ${m}. ${y}`;
  }
  const name = String(dayName || '').trim();
  if (name && dateCs && !name.includes(dateCs)) return `${name} · ${dateCs}`;
  if (name) return name;
  return dateCs || 'Den';
}

/**
 * Pole hlaviček ve stejném pořadí jako `structured.days` v uloženém plánu (pro e-mail).
 * @param {object|null|undefined} structured – např. structured_plan_json
 * @param {string|null|undefined} validFromIso
 * @returns {string[]|null}
 */
export function buildDayHeadingOverridesFromStructuredPlan(structured, validFromIso) {
  const days = structured?.days;
  const vf = validFromIso ? String(validFromIso).replace(/T.*/, '').slice(0, 10) : '';
  if (!Array.isArray(days) || !days.length || !/^\d{4}-\d{2}-\d{2}$/.test(vf)) return null;
  return days.map((day, i) => {
    const rawDate = typeof day?.date === 'string' ? day.date.replace(/T.*/, '').slice(0, 10) : '';
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : addCalendarDaysIsoPrague(vf, i);
    return formatPlanDayHeadingLine(day?.day_name, iso);
  });
}
