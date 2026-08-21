// Prevod dat z Apple Health na tvar, ktery ceka Bento.
//
// PRAVIDLO: bez dat zadny zaver. Backend uz rozlisuje "nevim" (null) od
// "namerena nula" (0) - viz lib/health/__tests__/noDataNoVerdict.test.ts.
// Adapter to nesmi rozmazat tim, ze by null prevedl na nulu a UI z toho
// udelalo tvrzeni o zdravi.
import type { AppleWatchBiometrics, AppleWatchWorkoutItem, MetricTrendPoint } from '../types';

/** Radek pohledu apple_health_recovery. */
export interface RadekRegenerace {
  local_date: string;
  hrv_ms: number | null;
  resting_hr: number | null;
  steps: number | null;
  active_kcal: number | null;
  exercise_min: number | null;
  has_sleep: boolean | null;
  sleep_asleep_min: number | null;
  hrv_baseline7: number | null;
  recovery_score: number | null;
  recovery_status: string | null;
}

export interface RadekTreninku {
  external_id?: string;
  workout_type: string | null;
  label_cs?: string | null;
  started_at: string | null;
  duration_s: number | null;
  active_kcal: number | null;
  avg_hr: number | null;
  max_hr: number | null;
}

/** null nebo necislo -> null. Namerenou nulu propousti. */
function jenCislo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function trend(radky: RadekRegenerace[], klic: keyof RadekRegenerace): MetricTrendPoint[] {
  return radky
    .filter((r) => jenCislo(r[klic]) !== null)
    .slice(-7)
    .map((r) => ({
      day: (r.local_date || '').slice(5).replace('-', '.'),
      value: Math.round(Number(r[klic]) * 10) / 10
    }));
}

function trvani(minuty: number | null): string {
  if (minuty === null) return '—';
  const h = Math.floor(minuty / 60);
  const m = Math.round(minuty % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/**
 * Verdikt o regeneraci se vraci jen tehdy, kdyz backend rekl recovery_status
 * 'ok' A zaroven mame skore. Jinak nic - radeji prazdno nez odhad.
 */
function regenerace(r: RadekRegenerace | null): {
  skore: number; stav: AppleWatchBiometrics['recoveryStatus']; rada: string;
} {
  const skore = r ? jenCislo(r.recovery_score) : null;
  if (!r || skore === null || r.recovery_status !== 'ok') {
    return { skore: 0, stav: 'Optimální', rada: '' };
  }
  if (skore >= 75) return { skore, stav: 'Připraven na max', rada: 'Tělo je odpočaté, můžeš přidat.' };
  if (skore >= 55) return { skore, stav: 'Optimální', rada: 'Regenerace v pořádku, drž plán.' };
  if (skore >= 35) return { skore, stav: 'Ubrat intenzitu', rada: 'Dnes spíš lehčí trénink.' };
  return { skore, stav: 'Potřeba odpočinku', rada: 'Dej si volno nebo jen procházku.' };
}

export function naTreninkyZHodinek(radky: RadekTreninku[] = []): AppleWatchWorkoutItem[] {
  return radky.slice(0, 10).map((w, i) => ({
    id: w.external_id || `w-${i}`,
    type: w.label_cs || w.workout_type || 'Trénink',
    icon: '',
    time: w.started_at
      ? new Date(w.started_at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
      : '',
    durationMin: Math.round((jenCislo(w.duration_s) ?? 0) / 60),
    caloriesBurned: Math.round(jenCislo(w.active_kcal) ?? 0),
    avgHr: Math.round(jenCislo(w.avg_hr) ?? 0),
    maxHr: Math.round(jenCislo(w.max_hr) ?? 0)
  }));
}

/** Ma smysl sekci vubec ukazovat? Bez jedineho merenÍ ne. */
export function maZdravotniData(radky: RadekRegenerace[] = []): boolean {
  return radky.some(
    (r) => jenCislo(r.hrv_ms) !== null || jenCislo(r.resting_hr) !== null || jenCislo(r.steps) !== null
  );
}

export function naBiometrii(
  radky: RadekRegenerace[] = [],
  treninky: RadekTreninku[] = [],
  pripojeno = false,
  poslednisync: string | null = null,
  vychozi: AppleWatchBiometrics
): AppleWatchBiometrics {
  const serazene = [...radky].sort((a, b) => String(a.local_date).localeCompare(String(b.local_date)));
  const dnes = serazene[serazene.length - 1] || null;
  const r = regenerace(dnes);

  return {
    ...vychozi,
    scaleConnected: false,
    appleWatchConnected: pripojeno,
    lastSyncTime: poslednisync
      ? new Date(poslednisync).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—',
    recoveryScore: r.skore,
    recoveryStatus: r.stav,
    recoveryAdvice: r.rada,
    hrvMs: jenCislo(dnes?.hrv_ms) ?? 0,
    hrvBaselineMs: jenCislo(dnes?.hrv_baseline7) ?? 0,
    restingHrBpm: jenCislo(dnes?.resting_hr) ?? 0,
    sleepDuration: dnes?.has_sleep ? trvani(jenCislo(dnes.sleep_asleep_min)) : '—',
    deepSleepDuration: '—',
    sleepEfficiencyPercent: 0,
    stepsToday: jenCislo(dnes?.steps) ?? 0,
    activeEnergyKcal: Math.round(jenCislo(dnes?.active_kcal) ?? 0),
    exerciseMinutes: jenCislo(dnes?.exercise_min) ?? 0,
    bloodOxygenPercent: 0,
    recentWorkouts: naTreninkyZHodinek(treninky),
    hrvTrend: trend(serazene, 'hrv_ms'),
    restingHrTrend: trend(serazene, 'resting_hr'),
    stepsTrend: trend(serazene, 'steps'),
    energyTrend: trend(serazene, 'active_kcal')
  };
}
