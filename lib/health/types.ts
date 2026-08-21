export type RecoveryStatus =
  | 'ok'
  | 'chybi_hrv'
  | 'chybi_klidovy_tep'
  | 'chybi_spanek'
  | 'nedostatek_dat';

export type ConnectionBannerLevel = 'ok' | 'warning' | 'none';

export interface ConnectionBanner {
  level: ConnectionBannerLevel;
  code: string | null;
  message: string | null;
}

export interface AppleHealthConnectionPublic {
  id: string;
  device_label: string;
  api_key_prefix: string;
  status: string;
  connected_at: string;
  last_sync_at: string | null;
  last_sync_error: string | null;
  sync_count: number;
  revoked_at: string | null;
  updated_at: string;
}

export interface ConnectionStatusResult {
  connections: AppleHealthConnectionPublic[];
  active: AppleHealthConnectionPublic | null;
  banner: ConnectionBanner;
}

export type RecoveryBand = 'high' | 'medium' | 'low' | null;

export interface RecoveryBandInfo {
  band: RecoveryBand;
  label: string | null;
  color: 'green' | 'orange' | 'red' | null;
}
