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
