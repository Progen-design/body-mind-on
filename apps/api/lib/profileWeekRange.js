/**
 * Týdenní okno kotvené k dni registrace (stejné jako přehled tréninků na profilu).
 * @param {Date|string} now
 * @param {Date|string|null} registrationDate – např. user.created_at
 * @returns {{ weekStartStr: string, weekEndStr: string }}
 */
export function getRegistrationAnchoredWeek(now, registrationDate) {
  const nowDate = new Date(now);
  nowDate.setHours(12, 0, 0, 0);
  const regDate = registrationDate ? new Date(registrationDate) : null;
  if (regDate) regDate.setHours(12, 0, 0, 0);
  const regDow = regDate != null ? regDate.getDay() : 1;
  const daysSinceWeekStart = (nowDate.getDay() - regDow + 7) % 7;
  const weekStart = new Date(nowDate);
  weekStart.setDate(nowDate.getDate() - daysSinceWeekStart);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return {
    weekStartStr: formatLocalYmd(weekStart),
    weekEndStr: formatLocalYmd(weekEnd),
  };
}

function formatLocalYmd(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
