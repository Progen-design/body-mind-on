import type {
  AppleWatchBiometrics,
  MetricTrendPoint,
  WeightRecord
} from '../types';

/** "dnes v 08:45" — text pod tlačítkem synchronizace. */
export function formatLastSynced(date: Date): string {
  const time = date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  return `dnes v ${time}`;
}

/** "Dnes v 08:45 přes Withings Cloud & Apple HealthKit" — do karty biometrie. */
export function formatSyncSource(date: Date): string {
  const time = date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  return `Dnes v ${time} přes Withings Cloud & Apple HealthKit`;
}

/** Popisek dne v trendech: "20.8." */
function trendDayLabel(date: Date): string {
  return `${date.getDate()}.${date.getMonth() + 1}.`;
}

/** Popisek měření v grafu váhy: "20.08." */
function measurementDateLabel(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}.${m}.`;
}

/** Popisek pro roční přehled: "08.2026" */
function monthLabel(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${m}.${date.getFullYear()}`;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Náhodná odchylka v rozsahu ±amount. */
const jitter = (amount: number) => (Math.random() - 0.5) * 2 * amount;

/**
 * Hodnota se posune náhodně, ale zároveň se přitahuje ke své klidové úrovni —
 * organismus se po zátěži vrací k baseline, nedriftuje donekonečna jedním směrem.
 */
const drift = (current: number, baseline: number, pull: number, noise: number) =>
  current + (baseline - current) * pull + jitter(noise);

/**
 * Zapíše dnešní hodnotu do trendu — pokud už dnešek v řadě je, přepíše ho,
 * jinak přidá nový bod a odsune nejstarší (řada drží 7 dní).
 */
function upsertTrendPoint(
  trend: MetricTrendPoint[],
  day: string,
  value: number,
  maxPoints = 7
): MetricTrendPoint[] {
  const last = trend[trend.length - 1];
  const next = last?.day === day
    ? [...trend.slice(0, -1), { day, value }]
    : [...trend, { day, value }];
  return next.slice(-maxPoints);
}

function deriveRecovery(hrvMs: number, baselineMs: number, restingHrBpm: number): {
  score: number;
  status: AppleWatchBiometrics['recoveryStatus'];
  advice: string;
} {
  const hrvRatio = hrvMs / (baselineMs || 1);
  const hrPenalty = clamp((restingHrBpm - 56) * 1.6, 0, 22);
  const score = Math.round(clamp(hrvRatio * 70 - hrPenalty + 8, 12, 99));

  if (score >= 85) {
    return {
      score,
      status: 'Připraven na max',
      advice: `HRV ${hrvMs.toFixed(1).replace('.', ',')} ms je nad tvým průměrem a klidový tep ${Math.round(restingHrBpm)} bpm je nízký. Nervová soustava je odpočatá — dnes můžeš jít do těžkých sérií a zkusit posunout osobní rekord.`
    };
  }
  if (score >= 70) {
    return {
      score,
      status: 'Optimální',
      advice: `HRV ${hrvMs.toFixed(1).replace('.', ',')} ms odpovídá tvému běžnému pásmu. Trénink podle plánu, pauzy 90 sekund, poslední série do dvou opakování před selháním.`
    };
  }
  if (score >= 50) {
    return {
      score,
      status: 'Ubrat intenzitu',
      advice: `HRV ${hrvMs.toFixed(1).replace('.', ',')} ms je pod baseline (${baselineMs.toFixed(1).replace('.', ',')} ms) a klidový tep ${Math.round(restingHrBpm)} bpm je zvýšený. Vynech drop-sety, prodluž pauzy na 90–120 sekund a drž se pod 80 % zátěže.`
    };
  }
  return {
    score,
    status: 'Potřeba odpočinku',
    advice: `HRV ${hrvMs.toFixed(1).replace('.', ',')} ms je výrazně pod baseline. Dnes zvol volnou chůzi nebo mobilitu, přidej hodinu spánku navíc a vrať se k zátěži zítra.`
  };
}

/**
 * Vytvoří novou sadu biometrických dat "stažených" z hodinek.
 * Kroky a energie rostou podle denní doby, ostatní metriky se drží
 * kolem předchozích hodnot s realistickou odchylkou.
 */
export function buildSyncedBiometrics(
  prev: AppleWatchBiometrics,
  now: Date = new Date()
): AppleWatchBiometrics {
  const dayProgress = clamp((now.getHours() * 60 + now.getMinutes()) / (22 * 60), 0.08, 1);
  const day = trendDayLabel(now);

  const hrvMs = round1(clamp(drift(prev.hrvMs, prev.hrvBaselineMs, 0.22, 5), 16, 68));
  const restingHrBpm = round1(clamp(drift(prev.restingHrBpm, 58, 0.2, 2.5), 48, 82));
  const stepsToday = Math.round(clamp(prev.stepsTarget * dayProgress + jitter(1400), 350, 26000));
  const activeEnergyKcal = Math.round(
    clamp(prev.activeEnergyTargetKcal * dayProgress + jitter(160), 90, 4200)
  );
  const exerciseMinutes = Math.round(
    clamp(prev.exerciseMinutesTarget * dayProgress + jitter(12), 0, 240)
  );
  const bloodOxygenPercent = round1(clamp(prev.bloodOxygenPercent + jitter(1.5), 92, 100));

  const { score, status, advice } = deriveRecovery(hrvMs, prev.hrvBaselineMs, restingHrBpm);

  return {
    ...prev,
    lastSyncTime: formatSyncSource(now),
    hrvMs,
    restingHrBpm,
    stepsToday,
    activeEnergyKcal,
    exerciseMinutes,
    bloodOxygenPercent,
    recoveryScore: score,
    recoveryStatus: status,
    recoveryAdvice: advice,
    hrvTrend: upsertTrendPoint(prev.hrvTrend, day, hrvMs),
    restingHrTrend: upsertTrendPoint(prev.restingHrTrend, day, restingHrBpm),
    stepsTrend: upsertTrendPoint(prev.stepsTrend, day, stepsToday),
    energyTrend: upsertTrendPoint(prev.energyTrend, day, activeEnergyKcal)
  };
}

/** Nové vážení odvozené z posledního záznamu (chytrá váha měří ráno nalačno). */
export function buildSyncedWeightRecord(
  last: WeightRecord,
  now: Date = new Date()
): WeightRecord {
  const weight = round1(clamp(last.weight + jitter(0.5), 40, 250));
  const fatPercent = round1(clamp(last.fatPercent + jitter(0.25), 3, 60));
  const muscleKg = round1(clamp(weight * (1 - fatPercent / 100) * 0.96, 20, 200));
  const bmi = round1(clamp(last.bmi + (weight - last.weight) * 0.3, 10, 60));

  return {
    date: measurementDateLabel(now),
    weight,
    fatPercent,
    muscleKg,
    bmi,
    note: 'Automatická synchronizace Withings Body Scan'
  };
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
