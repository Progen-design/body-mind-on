/**
 * Datumové pomůcky profilu — týdenní mřížka, české formáty, seskupení událostí.
 *
 * Vytaženo z pages/profil.js (refaktor 13. 8. 2026). Čisté funkce, dosud bez
 * jediného testu, přitom na nich stojí týdenní přehled i kalendář.
 *
 * VŠECHNO POČÍTÁ V LOKÁLNÍM ČASE, ne v UTC. Je to záměr: „dnes“ se musí
 * shodovat s tím, co uživatel vidí na hodinkách, jinak se po půlnoci
 * rozsvítí špatný den. Datumy bez času se proto parsují s polednem
 * (`T12:00:00`) — půlnoc by se při posunu pásma přelila do sousedního dne.
 *
 * POZOR: `components/HabitTracker.js` má vlastní kopii `getLocalDateStr`
 * s totožným chováním. Sjednotit ji sem je bezpečné, ale je to změna mimo
 * rozsah tohohle refaktoru — viz poznámka v shrnutí.
 */

export const WEEKDAY_LABELS = Object.freeze(['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']);

/** „13. srp 2026“, nebo pomlčka. */
export function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** „13. srp“ — zvládne i holé YYYY-MM-DD bez posunu o den. */
export function formatShortDate(d) {
  if (!d) return '—';
  // Pokud je to string ve formátu YYYY-MM-DD, přidat čas pro správné parsování
  let dateStr = d;
  if (typeof d === 'string' && d.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Přidat čas pro správné parsování (UTC, aby se předešlo problémům s timezone)
    dateStr = `${d}T12:00:00Z`;
  }
  const date = new Date(dateStr);
  // Zkontrolovat, zda je datum platné
  if (isNaN(date.getTime())) {
    console.warn('Invalid date:', d);
    return '—';
  }
  return date.toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'short',
  });
}

/** Vrací YYYY-MM-DD v lokálním čase (ne UTC). */
export function getLocalDateStr(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Pondělí daného týdne (Po = první den týdne). */
export function getMondayOfWeek(d) {
  const date = new Date(d);
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date;
}

/** @param {string} dateStr YYYY-MM-DD @param {number} n */
export function dateStrAddDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return getLocalDateStr(d);
}

/** Jeden týden: 7 dní od pondělí. */
export function getWeekDays(weekStartStr) {
  const out = [];
  const todayStr = getLocalDateStr(new Date());
  for (let i = 0; i < 7; i++) {
    const dateKey = dateStrAddDays(weekStartStr, i);
    const d = new Date(dateKey + 'T12:00:00');
    out.push({
      dateKey,
      dayNum: d.getDate(),
      isToday: dateKey === todayStr,
    });
  }
  return out;
}

/** „11. srp 2026 – 17. srp 2026“ */
export function formatWeekRange(weekStartStr) {
  const start = new Date(weekStartStr + 'T12:00:00');
  const end = new Date(dateStrAddDays(weekStartStr, 6) + 'T12:00:00');
  const fmt = (d) => d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Události seskupí podle lokálního data (ne UTC), aby se zobrazily ve správném dnu. */
export function getEventsByDate(events) {
  const byDate = {};
  (events || []).forEach((ev) => {
    if (!ev.start) return;
    const d = new Date(ev.start);
    if (isNaN(d.getTime())) return;
    const key = getLocalDateStr(d);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(ev);
  });
  return byDate;
}
