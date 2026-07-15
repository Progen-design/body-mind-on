import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildHealthDailyInsight,
  formatRecoveryDrivers,
  getMetricInsight,
} from '../insights.ts';

describe('health insights', () => {
  it('formatRecoveryDrivers explains HRV, RHR and sleep', () => {
    const drivers = formatRecoveryDrivers({
      hrv_delta_pct: -12,
      rhr_delta_bpm: 4,
      sleep_asleep_min: 330,
      has_sleep: true,
    });
    assert.equal(drivers.length, 3);
    assert.match(drivers[0].detail, /HRV|12 % pod/);
    assert.match(drivers[1].detail, /\+4 bpm/);
    assert.match(drivers[2].detail, /Krátký spánek/);
  });

  it('buildHealthDailyInsight recommends lighter training on low score', () => {
    const insight = buildHealthDailyInsight({
      recoveryRows: [
        {
          local_date: '2026-07-15',
          recovery_status: 'ok',
          recovery_score: 42,
          sleep_asleep_min: 300,
          steps: 4000,
        },
      ],
      watchRows: [],
      workoutRows: [],
    });
    assert.match(insight.summary ?? '', /zátěž/i);
    assert.ok(insight.recommendations.some((r) => /chůze|spánek|volno/i.test(r)));
  });

  it('buildHealthDailyInsight alerts on consecutive low recovery', () => {
    const insight = buildHealthDailyInsight({
      recoveryRows: [
        { local_date: '2026-07-15', recovery_status: 'ok', recovery_score: 40 },
        { local_date: '2026-07-14', recovery_status: 'ok', recovery_score: 38 },
      ],
      watchRows: [],
      workoutRows: [],
    });
    assert.ok(insight.alert);
    assert.match(insight.alert ?? '', /Dva dny/);
  });

  it('getMetricInsight interprets primary metrics', () => {
    assert.match(getMetricInsight('step_count', 3000) ?? '', /chůzi/);
    assert.match(getMetricInsight('apple_exercise_time', 35) ?? '', /Splněný/);
    assert.match(getMetricInsight('blood_oxygen_saturation', 93) ?? '', /95 %/);
  });
});
