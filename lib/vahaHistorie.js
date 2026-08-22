/**
 * HISTORIE VAH ZE DVOU TABULEK.
 *
 * `body_metrics` je snapshot z registrace a z ručních zápisů přes
 * /api/quick-weight. `body_measurements` je log měření — sem zapisuje
 * Withings cron i Apple Health import.
 *
 * Do 22. 8. 2026 se `weight_history` stavěla výhradně z `body_metrics`,
 * takže uživateli s funkční váhou zůstal v grafu jediný bod z registrace
 * a karta „Váha" byla týdny pozadu, přestože data v databázi byla.
 *
 * ČAS MĚŘENÍ, NE ČAS IMPORTU. U `body_measurements` rozhoduje `measured_at`
 * (kdy se člověk vážil), ne `created_at` (kdy to import zapsal) — liší se
 * o desítky minut a u nočního běhu cronu i o den. `body_metrics` sloupec
 * `measured_at` nemá, tam je časem záznamu `created_at`.
 *
 * DO body_metrics SE NIC NEDOPISUJE. Je to snapshot, ne log.
 *
 * DEN SE URČUJE V EUROPE/PRAGUE, ne v UTC. Vercel běží v UTC, takže vážení
 * mezi půlnocí a druhou ranní SELČ by `slice(0, 10)` posunul na předchozí den.
 * Stejnou hranici dne používají návyky (api/habits.js) i daily-activation.
 */
import { calendarDateIsoInPrague } from './czechCalendar.js';

/** Kalendářní den měření v Praze. Neplatná značka vrací prázdno, ne dnešek. */
function den(iso) {
  const t = Date.parse(String(iso || ''));
  // calendarDateIsoInPrague pri neplatnem vstupu vraci DNESEK — poskozeny
  // radek by se tak tvaril jako dnesni mereni. Proto se overuje predem.
  if (!Number.isFinite(t)) return '';
  return calendarDateIsoInPrague(new Date(t));
}

/** Porovnatelný čas. Neplatná značka jde na konec, ne na začátek. */
function cas(iso) {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? t : -Infinity;
}

function cislo(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? Number(n) : null;
}

/**
 * Sloučí obě tabulky do jednoho bodu na den.
 *
 * Při více měřeních v jednom dni vyhrává pozdější čas — bez ohledu na zdroj.
 * Ruční zápis odpoledne tedy přebije ranní vážení z váhy a naopak; nepobijí se.
 *
 * @param {{weight_kg?: number|string|null, created_at?: string}[]} bodyMetrics
 * @param {{weight_kg?: number|string|null, measured_at?: string, created_at?: string}[]} bodyMeasurements
 * @returns {{date: string, weight: number}[]} vzestupně podle data
 */
export function sestavHistoriiVah(bodyMetrics = [], bodyMeasurements = []) {
  /** @type {Map<string, {vaha: number, cas: number}>} */
  const podleDne = new Map();

  const pridej = (vahaRaw, casRaw) => {
    const vaha = cislo(vahaRaw);
    const d = den(casRaw);
    if (vaha === null || !d) return;

    const t = cas(casRaw);
    const stavajici = podleDne.get(d);
    // Ostra nerovnost: pri shode casu zustava prvni zapsany, at je vysledek
    // stabilni bez ohledu na poradi vstupu.
    if (!stavajici || t > stavajici.cas) {
      podleDne.set(d, { vaha, cas: t });
    }
  };

  for (const m of bodyMetrics || []) {
    pridej(m?.weight_kg, m?.created_at);
  }

  for (const m of bodyMeasurements || []) {
    // Radky bez vahy jsou platne — body_measurements nese i samotne obvody.
    pridej(m?.weight_kg, m?.measured_at || m?.created_at);
  }

  return [...podleDne.entries()]
    .map(([date, { vaha }]) => ({ date, weight: vaha }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
