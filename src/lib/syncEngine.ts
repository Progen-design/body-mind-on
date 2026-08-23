import type { WeightRecord } from '../types';

/**
 * ZBYTEK PO DEMU — CO TU BYLO A PROČ TO ZMIZELO.
 *
 * Tenhle soubor původně simuloval synchronizaci s hodinkami: `jitter()`,
 * `drift()`, `buildSyncedBiometrics()` a `buildSyncedWeightRecord()`
 * generovaly HRV, klidový tep, SpO2 i vážení z `Math.random()`, a
 * `deriveRecovery()` k nim dopisovala konkrétní tréninkové pokyny — délky
 * pauz mezi sériemi a procenta zátěže, spočítané z vymyšlených čísel.
 *
 * Od Etapy 3.10 čte aplikace čísla výhradně z `api/health/**` a rady
 * generuje TED z uživatelova vlastního profilu. Ty funkce už nikdo nevolal,
 * ale jejich texty se pořád balily do produkčního bundlu — vymyšlená
 * doporučení ležela pár řádků od kódu, který se opravdu spouští. Proto jsou
 * pryč celé, ne jen zakomentované.
 *
 * Zůstává jen to, co App.tsx skutečně importuje.
 */

/** Popisek pro roční přehled: "08.2026" */
function monthLabel(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${m}.${date.getFullYear()}`;
}

/** "dnes v 08:45" — text pod tlačítkem synchronizace. */
export function formatLastSynced(date: Date): string {
  const time = date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  return `dnes v ${time}`;
}

/**
 * Vloží nové vážení do všech časových řad. Když už pro dané období
 * existuje záznam se stejným popiskem (stejný den, resp. měsíc u 1R),
 * přepíše se — jinak by graf po každé synchronizaci narostl o bod navíc.
 */
export function applyWeightRecord(
  recordsByFilter: Record<string, WeightRecord[]>,
  record: WeightRecord,
  now: Date = new Date()
): Record<string, WeightRecord[]> {
  const next: Record<string, WeightRecord[]> = {};
  const yearLabel = monthLabel(now);

  for (const [filter, records] of Object.entries(recordsByFilter)) {
    const entry = filter === '1R' ? { ...record, date: yearLabel } : record;
    const last = records[records.length - 1];

    if (last && last.date === entry.date) {
      next[filter] = [...records.slice(0, -1), entry];
    } else {
      // Řady držíme v rozumné délce, ať zůstane graf čitelný.
      const maxPoints = filter === '1M' ? 10 : 8;
      next[filter] = [...records, entry].slice(-maxPoints);
    }
  }

  return next;
}
