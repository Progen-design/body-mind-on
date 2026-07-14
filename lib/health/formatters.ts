import type {
  AppleHealthConnectionPublic,
  ConnectionBanner,
  RecoveryBand,
  RecoveryBandInfo,
  RecoveryStatus,
} from './types';

const STALE_SYNC_MS = 24 * 60 * 60 * 1000;

export function toTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function formatDateTimeCs(value: string | null | undefined): string {
  const ms = toTimestampMs(value);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeSyncCs(value: string | null | undefined): string | null {
  const ms = toTimestampMs(value);
  if (!ms) return null;
  const diffMs = Date.now() - ms;
  if (diffMs < 0) return 'právě teď';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'právě teď';
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `před ${hours} h`;
  const days = Math.floor(hours / 24);
  return `před ${days} dny`;
}

export function isSyncStale(
  lastSyncAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const ms = toTimestampMs(lastSyncAt);
  if (!ms) return true;
  return nowMs - ms > STALE_SYNC_MS;
}

export function buildConnectionBanner(
  active: AppleHealthConnectionPublic | null,
  nowMs: number = Date.now(),
): ConnectionBanner {
  if (!active) {
    return {
      level: 'none',
      code: 'not_connected',
      message: 'Apple Watch zatím není propojený. Propoj zařízení pro synchronizaci zdravotních dat.',
    };
  }

  if (active.status === 'revoked') {
    return {
      level: 'warning',
      code: 'revoked',
      message: 'Připojení Apple Watch bylo zrušeno. Vygeneruj nový klíč pro obnovení synchronizace.',
    };
  }

  if (active.last_sync_error) {
    return {
      level: 'warning',
      code: 'sync_error',
      message: 'Poslední synchronizace selhala. Zkontroluj Health Auto Export a připojení v telefonu.',
    };
  }

  if (isSyncStale(active.last_sync_at, nowMs)) {
    return {
      level: 'warning',
      code: 'stale_sync',
      message: 'Data z Apple Watch nejsou aktuální (poslední sync je starší než 24 hodin).',
    };
  }

  return {
    level: 'ok',
    code: 'ok',
    message: null,
  };
}

export function getRecoveryBand(score: number | null | undefined): RecoveryBand {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const n = Number(score);
  if (n >= 75) return 'high';
  if (n >= 50) return 'medium';
  return 'low';
}

export function getRecoveryBandInfo(score: number | null | undefined): RecoveryBandInfo {
  const band = getRecoveryBand(score);
  if (band === 'high') {
    return { band, label: 'Jeď naplno', color: 'green' };
  }
  if (band === 'medium') {
    return { band, label: 'Ubrat intenzitu', color: 'orange' };
  }
  if (band === 'low') {
    return { band, label: 'Spíš regenerace', color: 'red' };
  }
  return { band: null, label: null, color: null };
}

const RECOVERY_STATUS_LABELS: Record<RecoveryStatus, string> = {
  ok: 'Data jsou kompletní',
  chybi_hrv: 'Chybí HRV — skóre nelze spočítat',
  chybi_klidovy_tep: 'Chybí klidový tep — skóre nelze spočítat',
  chybi_spanek: 'Chybí údaje o spánku',
  nedostatek_dat: 'Nedostatek dat pro 7denní baseline',
};

export function formatRecoveryStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  return RECOVERY_STATUS_LABELS[status as RecoveryStatus] ?? status;
}

export function formatDurationMinutes(durationSeconds: number | null | undefined): string {
  const sec = Number(durationSeconds);
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const minutes = Math.round(sec / 60);
  return `${minutes} min`;
}

export function formatDistanceKm(distanceMeters: number | null | undefined): string {
  const m = Number(distanceMeters);
  if (!Number.isFinite(m) || m <= 0) return '—';
  return `${(m / 1000).toFixed(2).replace('.', ',')} km`;
}

export const METRIC_CATEGORY_ORDER = [
  'aktivita',
  'srdce',
  'pohyb',
  'dychani',
  'telo',
  'prostredi',
  'spanek',
  'ostatni',
] as const;

export const METRIC_CATEGORY_LABELS: Record<string, string> = {
  aktivita: 'Aktivita',
  srdce: 'Srdce',
  pohyb: 'Pohyb',
  dychani: 'Dýchání',
  telo: 'Tělo',
  prostredi: 'Prostředí',
  spanek: 'Spánek',
  ostatni: 'Ostatní',
};

export function formatMetricUnitLabel(unit: string | null | undefined): string {
  const u = String(unit || '').trim();
  if (!u || u === 'count') return '';
  const map: Record<string, string> = {
    'count/min': 'bpm',
    kcal: 'kcal',
    min: 'min',
    km: 'km',
    m: 'm',
    ms: 'ms',
    '%': '%',
    kg: 'kg',
    cm: 'cm',
    degC: '°C',
    'mg/dL': 'mg/dL',
    'ml/(kg·min)': 'ml/kg/min',
    'kcal/hr·kg': 'kcal/h/kg',
    'km/hr': 'km/h',
    'm/s': 'm/s',
    dBASPL: 'dB',
    L: 'l',
  };
  return map[u] || u;
}

export function formatMetricValue(value: unknown, unit?: string | null): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const u = String(unit || '').trim();
  if (u === 'count' || u === '') return Math.round(n).toLocaleString('cs-CZ');
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString('cs-CZ');
  if (Math.abs(n) >= 10) return n.toFixed(1).replace('.', ',');
  return n.toFixed(2).replace('.', ',');
}

export interface LatestMetricSummary {
  metric_name: string;
  label_cs: string;
  category: string;
  unit: string;
  is_key: boolean;
  value: number | null;
  local_date: string;
}

export function groupLatestMetrics(
  rows: Array<Record<string, unknown>> = [],
): { keyMetrics: LatestMetricSummary[]; byCategory: Record<string, LatestMetricSummary[]> } {
  const latestByName = new Map<string, LatestMetricSummary>();

  for (const row of rows) {
    const metricName = String(row.metric_name || '');
    if (!metricName) continue;
    const localDate = String(row.local_date || '');
    const existing = latestByName.get(metricName);
    if (!existing || localDate > existing.local_date) {
      latestByName.set(metricName, {
        metric_name: metricName,
        label_cs: String(row.label_cs || metricName),
        category: String(row.category || 'ostatni'),
        unit: String(row.unit || ''),
        is_key: Boolean(row.is_key),
        value: Number.isFinite(Number(row.value)) ? Number(row.value) : null,
        local_date: localDate,
      });
    }
  }

  const all = Array.from(latestByName.values()).sort((a, b) =>
    a.label_cs.localeCompare(b.label_cs, 'cs'),
  );
  const keyMetrics = all.filter((m) => m.is_key);
  const byCategory: Record<string, LatestMetricSummary[]> = {};

  for (const metric of all) {
    const cat = metric.category || 'ostatni';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(metric);
  }

  return { keyMetrics, byCategory };
}
