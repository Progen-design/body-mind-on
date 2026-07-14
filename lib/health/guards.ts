const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function clampDays(value: unknown, defaultDays = 30): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return defaultDays;
  return Math.min(90, Math.max(1, Math.floor(n)));
}

export function clampLimit(value: unknown, defaultLimit = 20, maxLimit = 100): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return defaultLimit;
  return Math.min(maxLimit, Math.max(1, Math.floor(n)));
}

export function pragueDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function pragueDateDaysAgo(days: number, from: Date = new Date()): string {
  const clamped = clampDays(days, days);
  const anchor = pragueDateString(from);
  const [y, m, d] = anchor.split('-').map((part) => Number(part));
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - (clamped - 1));
  return utc.toISOString().slice(0, 10);
}
