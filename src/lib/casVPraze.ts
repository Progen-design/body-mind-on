/**
 * Hodina a minuta „teď" v Europe/Prague — sdílené mezi `pozdrav.ts`
 * a `dalsiKrok.ts` (PROMPT_DNES_HERO.md). Node/Vercel běží v UTC, syrové
 * `Date.getHours()` by dalo londýnský/UTC čas, ne pražský.
 */
export function casVPraze(ted: Date): { hodina: number; minuta: number } {
  const dily = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ted);
  const hodina = Number(dily.find((d) => d.type === 'hour')?.value ?? '0');
  const minuta = Number(dily.find((d) => d.type === 'minute')?.value ?? '0');
  return { hodina, minuta };
}
