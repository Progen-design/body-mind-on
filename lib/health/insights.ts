import {
  getHrvChartStatus,
  getRecoveryBandInfo,
  getRhrChartStatus,
} from './formatters.ts';
import { hasConsecutiveLowRecovery } from './recoveryReview.js';

export interface RecoveryDriver {
  label: string;
  detail: string;
}

export interface HealthDailyInsight {
  summary: string | null;
  recommendations: string[];
  alert: string | null;
}

type RecoveryRow = Record<string, unknown> | null | undefined;

function formatPctCs(value: number): string {
  return Math.abs(value).toFixed(0).replace('.', ',');
}

export function formatRecoveryDrivers(latest: RecoveryRow): RecoveryDriver[] {
  if (!latest) return [];
  const drivers: RecoveryDriver[] = [];

  const hrvDelta = Number(latest.hrv_delta_pct);
  if (Number.isFinite(hrvDelta)) {
    const dir = hrvDelta >= 0 ? 'nad' : 'pod';
    let interp = 'Blízko tvého průměru.';
    if (hrvDelta >= 5) interp = 'Lepší regenerace než obvykle.';
    else if (hrvDelta <= -10) interp = 'Zátěž nebo únava — tělo pracuje víc.';
    drivers.push({
      label: 'HRV',
      detail: `${formatPctCs(hrvDelta)} % ${dir} 7d průměrem. ${interp}`,
    });
  }

  const rhrDelta = Number(latest.rhr_delta_bpm);
  if (Number.isFinite(rhrDelta)) {
    const sign = rhrDelta > 0 ? '+' : '';
    let interp = 'V toleranci k průměru.';
    if (rhrDelta > 3) interp = 'Možná stres, únava nebo nemoc.';
    else if (rhrDelta < -2) interp = 'Nižší než obvykle — dobré znamení.';
    drivers.push({
      label: 'Klidový tep',
      detail: `${sign}${Math.round(rhrDelta)} bpm oproti průměru. ${interp}`,
    });
  }

  const sleepMin = Number(latest.sleep_asleep_min);
  if (Number.isFinite(sleepMin) && sleepMin > 0) {
    const hours = (sleepMin / 60).toFixed(1).replace('.', ',');
    let interp = 'Střední délka — sleduj trend.';
    if (sleepMin < 360) interp = 'Krátký spánek snižuje zotavení.';
    else if (sleepMin >= 420 && sleepMin <= 540) interp = 'Rozsah vhodný pro regeneraci.';
    else if (sleepMin > 540) interp = 'Delší spánek — dobrá báze pro zotavení.';
    drivers.push({ label: 'Spánek', detail: `${hours} h. ${interp}` });
  } else if (latest.has_sleep === false) {
    drivers.push({
      label: 'Spánek',
      detail: 'Bez údajů — skóre vychází jen z HRV a klidového tepu.',
    });
  }

  return drivers;
}

export function getPersonalHrvCaption(latest: RecoveryRow): string | null {
  if (!latest) return null;
  return getHrvChartStatus(
    latest.hrv_ms as number | null | undefined,
    latest.hrv_baseline7 as number | null | undefined,
  );
}

export function getPersonalRhrCaption(latest: RecoveryRow): string | null {
  if (!latest) return null;
  return getRhrChartStatus(
    latest.resting_hr as number | null | undefined,
    latest.rhr_baseline7 as number | null | undefined,
  );
}

export function getMetricInsight(metricName: string, value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  switch (metricName) {
    case 'step_count':
      if (n < 5000) return 'Pod denním cílem pohybu — přidej chůzi.';
      if (n >= 10000) return 'Skvělý denní objem pohybu.';
      return 'Střední aktivita — dobrý základ.';
    case 'apple_exercise_time':
      if (n < 20) return 'Pod doporučených 30 min cvičení.';
      if (n >= 30) return 'Splněný cvičební kruh Apple.';
      return 'Blízko cíle — ještě pár minut pohybu.';
    case 'active_energy':
      if (n < 200) return 'Nízká aktivní energie — málo intenzivního pohybu.';
      if (n >= 500) return 'Vysoká denní zátěž — hlídej regeneraci.';
      return null;
    case 'walking_running_distance':
      if (n < 3) return 'Krátká vzdálenost — prodlouž procházku.';
      if (n >= 8) return 'Solidní denní vzdálenost.';
      return null;
    case 'vo2_max':
      if (n >= 45) return 'Vysoká kondice — udrž pravidelný trénink.';
      if (n < 30) return 'Nižší VO₂ — pravidelný kardio postupně pomůže.';
      return 'Kondiční ukazatel — sleduj trend v čase.';
    case 'blood_oxygen_saturation':
      if (n < 95) return 'Pod 95 % — sleduj stav; při potížích konzultuj lékaře.';
      return 'V běžném rozmezí při měření.';
    default:
      return null;
  }
}

export function buildHealthDailyInsight({
  recoveryRows = [],
  watchRows = [],
  workoutRows = [],
}: {
  recoveryRows?: Array<Record<string, unknown>>;
  watchRows?: Array<Record<string, unknown>>;
  workoutRows?: Array<Record<string, unknown>>;
}): HealthDailyInsight {
  const latest = recoveryRows?.[0] || null;
  const watchLatest = watchRows?.[0] || null;
  const recommendations: string[] = [];
  let summary: string | null = null;
  let alert: string | null = null;

  if (hasConsecutiveLowRecovery(recoveryRows)) {
    alert =
      'Dva dny po sobě nízká regenerace — zvaž odpočinek nebo lehký pohyb místo tvrdého tréninku.';
  }

  const score = Number(latest?.recovery_score);
  const statusOk = latest?.recovery_status === 'ok';

  if (!latest) {
    return {
      summary: 'Zatím nemáme dost dat pro osobní doporučení.',
      recommendations: ['Propoj Apple Watch a počkej pár dní na 7denní průměr.'],
      alert: null,
    };
  }

  if (!statusOk || !Number.isFinite(score)) {
    summary = 'Pro kompletní vyhodnocení potřebujeme víc dní dat z Apple Watch (HRV a klidový tep).';
    recommendations.push(
      'Nech hodinky synchronizovat přes noc — ráno bývá nejlepší signál regenerace.',
    );
    return { summary, recommendations, alert };
  }

  const band = getRecoveryBandInfo(score);
  if (score >= 75) {
    summary = 'Regenerace vypadá dobře — tělo je připravené na běžnou zátěž.';
    recommendations.push('Můžeš držet plánovaný trénink; poslouchej tělo během rozcvičky.');
  } else if (score >= 50) {
    summary = `Částečná únava (${band.label || 'ubrat intenzitu'}) — signály nejsou kritické, ale kapacita není plná.`;
    recommendations.push('Zvaž lehčí trénink, kratší sérii nebo techniku místo maximální intenzity.');
  } else {
    summary = `Tělo ukazuje zátěž (${band.label || 'regenerace'}) — prioritizuj zotavení před výkonem.`;
    recommendations.push('Dnes spíš chůze, strečink nebo volno; spánek a hydratace pomůžou nejvíc.');
  }

  const sleepMin = Number(latest.sleep_asleep_min);
  if (Number.isFinite(sleepMin) && sleepMin > 0 && sleepMin < 360) {
    recommendations.push(
      `Krátký spánek (${(sleepMin / 60).toFixed(1).replace('.', ',')} h) — dnes pomůže dřívější ulehnutí.`,
    );
  }

  const steps = Number(watchLatest?.steps ?? latest.steps);
  if (Number.isFinite(steps)) {
    if (steps < 5000 && score >= 50) {
      recommendations.push('Málo kroků — 20–30 min chůze zlepší prokrvení bez další zátěže.');
    } else if (steps > 10000 && score < 50) {
      recommendations.push(
        'Hodně pohybu při nízké regeneraci — zítra radši ulev, ať tělo doženlo zotavení.',
      );
    }
  }

  const lastWorkout = workoutRows?.[0];
  if (lastWorkout) {
    const dur = Number(lastWorkout.duration_s);
    const recentDate = String(lastWorkout.local_date || '').slice(0, 10);
    const recoveryDate = String(latest.local_date || '').slice(0, 10);
    const label = String(lastWorkout.label_cs || lastWorkout.workout_type || 'trénink');
    if (Number.isFinite(dur) && dur >= 45 * 60 && score < 60 && recentDate <= recoveryDate) {
      recommendations.push(
        `Po nedávném tréninku (${label}) dává smysl lehčí den — svaly se ještě zotavují.`,
      );
    }
  }

  const exerciseMin = Number(watchLatest?.exercise_min ?? latest.exercise_min);
  if (Number.isFinite(exerciseMin) && exerciseMin < 20 && score >= 60) {
    recommendations.push('Cvičební kruh pod 20 min — krátká procházka doplní aktivní minuty.');
  }

  const unique = [...new Set(recommendations)].slice(0, 4);
  return { summary, recommendations: unique, alert };
}
