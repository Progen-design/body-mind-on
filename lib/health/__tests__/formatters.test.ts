import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildConnectionBanner,
  formatMetricUnitLabel,
  formatMetricValue,
  formatRecoveryStatusLabel,
  getRecoveryBand,
  getRecoveryBandInfo,
  groupLatestMetrics,
  isSyncStale,
} from '../formatters.ts';
import { clampDays, clampLimit, isUuid, pragueDateDaysAgo } from '../guards.ts';

describe('health guards', () => {
  it('clampDays keeps range 1..90', () => {
    assert.equal(clampDays(undefined), 30);
    assert.equal(clampDays(0), 1);
    assert.equal(clampDays(120), 90);
    assert.equal(clampDays('14'), 14);
    assert.equal(clampDays('bad'), 30);
  });

  it('clampLimit keeps range 1..100', () => {
    assert.equal(clampLimit(undefined), 20);
    assert.equal(clampLimit(0), 1);
    assert.equal(clampLimit(500), 100);
  });

  it('isUuid validates uuid format', () => {
    assert.equal(isUuid('ff90dd02-d441-4fb8-a7df-e4fdc5ec3448'), true);
    assert.equal(isUuid('not-a-uuid'), false);
  });

  it('pragueDateDaysAgo returns ISO date', () => {
    const value = pragueDateDaysAgo(7, new Date('2026-07-14T12:00:00Z'));
    assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('health formatters', () => {
  const activeConnection = {
    id: '11111111-1111-4111-8111-111111111111',
    device_label: 'iPhone',
    api_key_prefix: 'bmon_ah_abcd',
    status: 'active',
    connected_at: '2026-07-01T10:00:00.000Z',
    last_sync_at: '2026-07-14T08:00:00.000Z',
    last_sync_error: null,
    sync_count: 12,
    revoked_at: null,
    updated_at: '2026-07-14T08:00:00.000Z',
  };

  it('buildConnectionBanner warns on stale sync', () => {
    const banner = buildConnectionBanner(activeConnection, Date.parse('2026-07-15T10:00:00.000Z'));
    assert.equal(banner.level, 'warning');
    assert.equal(banner.code, 'stale_sync');
  });

  it('buildConnectionBanner warns on sync error', () => {
    const banner = buildConnectionBanner(
      { ...activeConnection, last_sync_error: 'timeout' },
      Date.parse('2026-07-14T09:00:00.000Z'),
    );
    assert.equal(banner.level, 'warning');
    assert.equal(banner.code, 'sync_error');
  });

  it('buildConnectionBanner is ok for fresh sync', () => {
    const banner = buildConnectionBanner(activeConnection, Date.parse('2026-07-14T09:00:00.000Z'));
    assert.equal(banner.level, 'ok');
    assert.equal(banner.message, null);
  });

  it('isSyncStale respects 24h window', () => {
    assert.equal(isSyncStale('2026-07-13T07:00:00.000Z', Date.parse('2026-07-14T08:00:00.000Z')), true);
    assert.equal(isSyncStale('2026-07-14T07:30:00.000Z', Date.parse('2026-07-14T08:00:00.000Z')), false);
  });

  it('getRecoveryBand maps score bands', () => {
    assert.equal(getRecoveryBand(80), 'high');
    assert.equal(getRecoveryBand(60), 'medium');
    assert.equal(getRecoveryBand(40), 'low');
    assert.equal(getRecoveryBand(null), null);
  });

  it('getRecoveryBandInfo returns Czech labels', () => {
    assert.equal(getRecoveryBandInfo(82).label, 'Jeď naplno');
    assert.equal(getRecoveryBandInfo(55).label, 'Ubrat intenzitu');
    assert.equal(getRecoveryBandInfo(30).label, 'Spíš regenerace');
  });

  it('formatRecoveryStatusLabel maps known statuses', () => {
    assert.match(formatRecoveryStatusLabel('chybi_hrv') ?? '', /HRV/);
    assert.equal(formatRecoveryStatusLabel('nedostatek_dat'), 'Nedostatek dat pro 7denní baseline');
  });

  it('groupLatestMetrics picks newest local_date per metric', () => {
    const { keyMetrics, byCategory } = groupLatestMetrics([
      { metric_name: 'step_count', label_cs: 'Kroky', category: 'aktivita', unit: 'count', is_key: true, value: 1000, local_date: '2026-07-10' },
      { metric_name: 'step_count', label_cs: 'Kroky', category: 'aktivita', unit: 'count', is_key: true, value: 1200, local_date: '2026-07-12' },
      { metric_name: 'heart_rate', label_cs: 'Tep', category: 'srdce', unit: 'count/min', is_key: false, value: 72, local_date: '2026-07-11' },
    ]);
    assert.equal(keyMetrics.length, 1);
    assert.equal(keyMetrics[0].value, 1200);
    assert.equal(byCategory.srdce?.[0]?.value, 72);
  });

  it('formatMetricValue formats Czech numbers', () => {
    assert.match(formatMetricValue(1234.5, 'count'), /1.?235/);
    assert.equal(formatMetricUnitLabel('count/min'), 'bpm');
  });
});
