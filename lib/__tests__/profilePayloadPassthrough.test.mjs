/**
 * `normalizeProfilePayload` je WHITELIST — co se do něj nedopíše, klient neuvidí.
 *
 * Doloženo 15. 8. 2026: `/api/profile` vracel `body_measurements`, normalizace
 * je zahodila a `ProfileProgressSection` tak vždycky dostala prázdné pole.
 * Ruční zápis váhy se korektně uložil (HTTP 201, `source='manual'`) a v profilu
 * se pak stejně nikdy neobjevil — sekce dál ukazovala váhu z registrace.
 * Bez tohohle testu je to chyba, kterou nic nechytí: API i zápis jsou v pořádku,
 * ztrácí se to až mezi nimi.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfilePayload } from '../profileApi.js';

/** Klíče, které profil potřebuje na sekci Progres. */
const MUSI_PROJIT = [
  'body_measurements',
  'daily_activity_completions',
  'daily_checkins',
  'habit_logs_progress',
];

const PAYLOAD = {
  user: { id: 'u1' },
  body_metrics: [{ id: 'm1', created_at: '2026-08-14T22:36:00Z', weight_kg: 82 }],
  workouts: [{ workout_date: '2026-08-14', workout_type: 'plavani', duration_min: 60 }],
  body_measurements: [
    { id: 'x1', measured_at: '2026-08-14T10:00:00Z', weight_kg: 79.4, waist_cm: 88, source: 'manual' },
  ],
  daily_activity_completions: [{ activity_type: 'meal', activity_key: 'snack#2', completed_at: '2026-08-14T12:00:00Z' }],
  daily_checkins: [{ checkin_date: '2026-08-14' }],
  habit_logs_progress: [{ log_date: '2026-08-14', completed: true }],
};

test('klíče pro sekci Progres projdou normalizací', () => {
  const p = normalizeProfilePayload(PAYLOAD);
  for (const klic of MUSI_PROJIT) {
    assert.ok(Array.isArray(p[klic]), `${klic} musí být pole, je ${typeof p[klic]}`);
    assert.equal(p[klic].length, PAYLOAD[klic].length, `${klic} se nesmí ztratit`);
  }
});

test('ruční měření přežije normalizaci celé', () => {
  const p = normalizeProfilePayload(PAYLOAD);
  const m = p.body_measurements[0];
  assert.equal(m.weight_kg, 79.4);
  assert.equal(m.waist_cm, 88);
  assert.equal(m.source, 'manual');
});

test('chybějící klíče nespadnou, vrátí prázdné pole', () => {
  const p = normalizeProfilePayload({ user: null });
  for (const klic of MUSI_PROJIT) {
    assert.deepEqual(p[klic], [], `${klic} má být prázdné pole`);
  }
});

test('normalizace nemutuje vstup', () => {
  const vstup = JSON.parse(JSON.stringify(PAYLOAD));
  const p = normalizeProfilePayload(vstup);
  p.body_measurements.push({ id: 'novy' });
  assert.equal(vstup.body_measurements.length, 1, 'vstupní pole zůstává nedotčené');
});
