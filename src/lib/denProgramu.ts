// Den N tvého programu — registrace = Den 1, počítáno v Europe/Prague.
// PROMPT_DNES_HERO.md.
import { calendarDateIsoInPrague } from '../../lib/czechCalendar.js';

/** Poledne UTC pro kalendářní datum YYYY-MM-DD — stejný trik jako
 * `addCalendarDaysIsoPrague` v lib/czechCalendar.js: bezpečné vůči DST,
 * protože se počítá jen rozdíl celých kalendářních dnů, ne reálný čas. */
function poledneUtcMs(isoDatum: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDatum || '').slice(0, 10));
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

/**
 * @param registrovanOd ISO datum/čas registrace (`user.created_at`)
 * @param ted aktuální čas — injektovatelné kvůli testům
 * @returns Den N (>= 1), nebo `null` bez data registrace
 */
export function denProgramu(registrovanOd: string | null | undefined, ted: Date = new Date()): number | null {
  if (!registrovanOd) return null;

  const regIso = calendarDateIsoInPrague(registrovanOd);
  const dnesIso = calendarDateIsoInPrague(ted);
  const regMs = poledneUtcMs(regIso);
  const dnesMs = poledneUtcMs(dnesIso);
  if (!Number.isFinite(regMs) || !Number.isFinite(dnesMs)) return null;

  const rozdilDni = Math.round((dnesMs - regMs) / 86_400_000);
  return rozdilDni + 1;
}
