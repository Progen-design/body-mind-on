import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer as supabaseServerUntyped } from '../supabaseServer';
import { buildConnectionBanner } from './formatters';
import { clampDays, clampLimit, isUuid, pragueDateDaysAgo } from './guards';
import type {
  AppleHealthConnectionPublic,
  ConnectionStatusResult,
} from './types';

const supabaseServer = supabaseServerUntyped as SupabaseClient;

const CONNECTION_SELECT =
  'id, device_label, api_key_prefix, status, connected_at, last_sync_at, last_sync_error, sync_count, revoked_at, updated_at';

const WORKOUT_SELECT =
  'id, external_id, workout_type, started_at, ended_at, local_date, duration_s, active_kcal, total_kcal, distance_m, avg_hr, max_hr, elevation_m, created_at';

function assertUserId(userId: string): void {
  if (!isUuid(userId)) {
    throw new Error('Neplatné user_id');
  }
}

function mapConnection(row: Record<string, unknown>): AppleHealthConnectionPublic {
  return {
    id: String(row.id),
    device_label: String(row.device_label ?? ''),
    api_key_prefix: String(row.api_key_prefix ?? ''),
    status: String(row.status ?? ''),
    connected_at: String(row.connected_at ?? ''),
    last_sync_at: row.last_sync_at ? String(row.last_sync_at) : null,
    last_sync_error: row.last_sync_error ? String(row.last_sync_error) : null,
    sync_count: Number(row.sync_count ?? 0),
    revoked_at: row.revoked_at ? String(row.revoked_at) : null,
    updated_at: String(row.updated_at ?? ''),
  };
}

export async function getWatchDaily(userId: string, days = 30) {
  assertUserId(userId);
  const safeDays = clampDays(days, 30);
  const sinceDate = pragueDateDaysAgo(safeDays);

  const { data, error } = await supabaseServer
    .from('apple_health_daily')
    .select('*')
    .eq('user_id', userId)
    .gte('local_date', sinceDate)
    .order('local_date', { ascending: false });

  if (error) throw new Error(error.message || 'Nepodařilo se načíst data Apple Watch.');
  return data ?? [];
}

export async function getScaleDaily(userId: string, days = 30) {
  assertUserId(userId);
  const safeDays = clampDays(days, 30);
  const sinceDate = pragueDateDaysAgo(safeDays);

  const { data, error } = await supabaseServer
    .from('withings_daily')
    .select('*')
    .eq('user_id', userId)
    .gte('local_date', sinceDate)
    .order('local_date', { ascending: false });

  if (error) throw new Error(error.message || 'Nepodařilo se načíst data Withings.');
  return data ?? [];
}

export async function getRecovery(userId: string, days = 30) {
  assertUserId(userId);
  const safeDays = clampDays(days, 30);
  const sinceDate = pragueDateDaysAgo(safeDays);

  const { data, error } = await supabaseServer
    .from('apple_health_recovery')
    .select('*')
    .eq('user_id', userId)
    .gte('local_date', sinceDate)
    .order('local_date', { ascending: false });

  if (error) throw new Error(error.message || 'Nepodařilo se načíst regenerační data.');
  return data ?? [];
}

export async function getWorkouts(userId: string, limit = 20) {
  assertUserId(userId);
  const safeLimit = clampLimit(limit, 20, 100);

  const { data: workouts, error } = await supabaseServer
    .from('apple_health_workouts')
    .select(WORKOUT_SELECT)
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(error.message || 'Nepodařilo se načíst tréninky.');

  const rows = workouts ?? [];
  const rawTypes = Array.from(
    new Set(
      rows
        .map((row) => row.workout_type)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );

  let typeMap = new Map<string, { canonical: string; label_cs: string; category: string }>();
  if (rawTypes.length > 0) {
    const { data: mapped, error: mapError } = await supabaseServer
      .from('workout_type_map')
      .select('raw_type, canonical, label_cs, category')
      .in('raw_type', rawTypes);

    if (mapError) throw new Error(mapError.message || 'Nepodařilo se načíst mapování tréninků.');

    typeMap = new Map(
      (mapped ?? []).map((row) => [
        String(row.raw_type),
        {
          canonical: String(row.canonical),
          label_cs: String(row.label_cs),
          category: String(row.category),
        },
      ]),
    );
  }

  return rows.map((row) => {
    const rawType = typeof row.workout_type === 'string' ? row.workout_type : null;
    const mapped = rawType ? typeMap.get(rawType) : undefined;
    return {
      ...row,
      canonical_type: mapped?.canonical ?? (rawType ? 'unmapped' : null),
      label_cs: mapped?.label_cs ?? rawType,
      category: mapped?.category ?? 'jina',
    };
  });
}

export async function getConnectionStatus(userId: string): Promise<ConnectionStatusResult> {
  assertUserId(userId);

  const { data, error } = await supabaseServer
    .from('apple_health_connections')
    .select(CONNECTION_SELECT)
    .eq('user_id', userId)
    .order('connected_at', { ascending: false });

  if (error) throw new Error(error.message || 'Nepodařilo se načíst stav připojení.');

  const connections = (data ?? []).map((row) => mapConnection(row as Record<string, unknown>));
  const active =
    connections.find((row) => row.status === 'active') ??
    connections.find((row) => row.status !== 'revoked') ??
    connections[0] ??
    null;

  return {
    connections,
    active,
    banner: buildConnectionBanner(active),
  };
}
