/**
 * Kalendářní datum YYYY-MM-DD v časové zóně Europe/Prague (pro platnost plánu a týdenní řádky).
 * Vercel běží v UTC — nepoužívat raw toISOString().slice(0,10) jako „dnes“ pro CZ uživatele.
 */

/**
 * @param {Date|string|number} [date]
 * @returns {string} YYYY-MM-DD
 */
export function calendarDateIsoInPrague(date = new Date()) {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Prague',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Přičte n kalendářních dní k ISO datu (interpretace data v Praze).
 * @param {string} isoDate YYYY-MM-DD
 * @param {number} n
 * @returns {string} YYYY-MM-DD
 */
export function addCalendarDaysIsoPrague(isoDate, n) {
  const s = String(isoDate || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return calendarDateIsoInPrague(new Date());
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const step = Number(n) || 0;
  const utcNoon = Date.UTC(y, mo - 1, da + step, 12, 0, 0);
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(utcNoon));
}

/**
 * Kalendářní pondělí pro „týden plánu“: pokud daný den už je pondělí (Europe/Prague), vrátí ho;
 * jinak nejbližší následující pondělí. Pro onboarding chceme Po–Ne, ne den registrace.
 * @param {Date|string} [refIsoOrDate]
 * @returns {string} YYYY-MM-DD
 */
export function nextMondayStartIsoPrague(refIsoOrDate = new Date()) {
  const iso =
    typeof refIsoOrDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(refIsoOrDate).trim())
      ? String(refIsoOrDate).trim().slice(0, 10)
      : calendarDateIsoInPrague(refIsoOrDate);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return calendarDateIsoInPrague(new Date());
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const utcNoon = Date.UTC(y, mo - 1, da, 12, 0, 0);
  const wdStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Prague',
    weekday: 'short',
  }).format(new Date(utcNoon));
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[wdStr] ?? 1;
  if (dow === 1) return iso;
  const daysUntilMon = dow === 0 ? 1 : 8 - dow;
  return addCalendarDaysIsoPrague(iso, daysUntilMon);
}
