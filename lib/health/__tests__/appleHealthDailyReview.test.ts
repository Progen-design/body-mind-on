import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hasConsecutiveLowRecovery } from '../recoveryReview.js';

describe('apple health daily review', () => {
  it('detects two consecutive low recovery days', () => {
    const rows = [
      { local_date: '2026-07-13', recovery_status: 'ok', recovery_score: 42 },
      { local_date: '2026-07-14', recovery_status: 'ok', recovery_score: 38 },
    ];
    assert.equal(hasConsecutiveLowRecovery(rows), true);
  });

  it('ignores non-ok recovery_status for streak', () => {
    const rows = [
      { local_date: '2026-07-13', recovery_status: 'chybi_hrv', recovery_score: 30 },
      { local_date: '2026-07-14', recovery_status: 'ok', recovery_score: 40 },
    ];
    assert.equal(hasConsecutiveLowRecovery(rows), false);
  });

  it('resets streak after high recovery day', () => {
    const rows = [
      { local_date: '2026-07-12', recovery_status: 'ok', recovery_score: 40 },
      { local_date: '2026-07-13', recovery_status: 'ok', recovery_score: 80 },
      { local_date: '2026-07-14', recovery_status: 'ok', recovery_score: 45 },
    ];
    assert.equal(hasConsecutiveLowRecovery(rows), false);
  });
});
