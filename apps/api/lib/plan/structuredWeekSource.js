import { addCalendarDaysIsoPrague, weekdayIndexJsFromPragueIso } from '../czechCalendar.js';

const CZECH_DAYS_BY_DOW = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

function addDaysToDateStr(dateStr, days) {
  return addCalendarDaysIsoPrague(String(dateStr || '').split('T')[0], days);
}

function getDayNameForPlanSlot(validFromIso, slotIndex) {
  const vf = String(validFromIso || '').split('T')[0];
  if (!vf) return '';
  return CZECH_DAYS_BY_DOW[weekdayIndexJsFromPragueIso(vf, slotIndex)] || '';
}

function formatDayLabel(isoStr) {
  if (!isoStr) return '';
  return new Date(`${isoStr}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
}

function findDayForDate(days, origIdx, validFromIso) {
  const expected = getDayNameForPlanSlot(validFromIso, origIdx);
  if (!expected || !days.length) return days[origIdx] || days[0];
  const byIndex = days[origIdx];
  const nameMatch = (d) => (d?.dayName || '').toLowerCase().includes(expected.toLowerCase());
  if (byIndex && nameMatch(byIndex)) return byIndex;
  const found = days.find(nameMatch);
  return found || byIndex || days[0];
}

/**
 * Single source for weekly + today day cards.
 * Prefers structured_plan_json for every day when available.
 */
export function buildStructuredWeekSource({
  parsedDays = [],
  structuredPlan = null,
  validFrom = '',
  validUntil = '',
  todayIsoStr = '',
  isFuturePlan = false,
  planHtml = '',
  buildMealsFromStructuredDay,
}) {
  const planFrom = String(validFrom || '').split('T')[0];
  if (!planFrom) {
    const fallbackDays = (parsedDays || []).map((d, i) => ({
      ...d,
      dateStr: '',
      isToday: false,
      originalIndex: i,
      afterPlanEnd: false,
    }));
    return {
      useStruct: false,
      planWeekDays: fallbackDays,
      todayWeekIdx: fallbackDays.findIndex((d) => d.isToday),
      todayWeekDay: fallbackDays[0] || null,
    };
  }

  const structDays = Array.isArray(structuredPlan?.days) ? structuredPlan.days : null;
  const useStruct = !!(structDays && structDays.length > 0);
  const validUntilStr = String(validUntil || '').split('T')[0];
  const result = [];

  for (let origIdx = 0; origIdx < 7; origIdx += 1) {
    const dateIso = addDaysToDateStr(planFrom, origIdx);
    const dayNameFromDate = getDayNameForPlanSlot(planFrom, origIdx);
    const htmlDay = !useStruct && parsedDays.length > 0 ? findDayForDate(parsedDays, origIdx, planFrom) : null;
    const structDay = useStruct
      ? structDays[origIdx] ?? structDays.find((d) => (d?.date || '').split('T')[0] === dateIso)
      : null;
    const structMeals = structDay && typeof buildMealsFromStructuredDay === 'function'
      ? buildMealsFromStructuredDay(structDay, planHtml || '')
      : null;
    const meals = structMeals && structMeals.length > 0
      ? structMeals
      : useStruct
        ? []
        : htmlDay?.meals || [];
    const afterPlanEnd = !!(validUntilStr && dateIso > validUntilStr);

    result.push({
      ...(!useStruct && htmlDay ? htmlDay : {}),
      structDay: structDay || null,
      dayName: dayNameFromDate || structDay?.day_name || htmlDay?.dayName || `Den ${origIdx + 1}`,
      meals,
      dateStr: dateIso ? formatDayLabel(dateIso) : '',
      isToday: dateIso === todayIsoStr && !isFuturePlan,
      originalIndex: origIdx,
      afterPlanEnd,
      _placeholder: useStruct ? !structDay : !!(htmlDay?._placeholder),
    });
  }

  const todayWeekIdx = result.findIndex((d) => d.isToday);
  const todayWeekDay = todayWeekIdx >= 0 ? result[todayWeekIdx] : result[0] || null;
  return { useStruct, planWeekDays: result, todayWeekIdx, todayWeekDay };
}
