/**
 * Ručně zapsaný trénink v souhrnných statistikách — regrese k bugu
 * z testování trenérem (15. 8. 2026).
 *
 * Trenér zapsal plavání 60 min a v souhrnu se neobjevilo nic: ani počet
 * tréninků, ani minuty, ani kalorie. `computeActivitySummary` ho přitom
 * počítá správně — profil ale jeho výsledek přepisoval čísly z
 * `get_user_activity_stats`, a ta funkce tabulku `workouts` vůbec nečte.
 *
 * Test hlídá tu stranu, která je čistá logika: že souhrn ruční trénink
 * vidí, správně z něj spočítá minuty i kalorie a že vrací i konkrétní
 * aktivní dny (bez nich by se den se zápisem i pohybem z hodinek započítal
 * dvakrát).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeActivitySummary } from '../progressIntegrity.js';

const dnesKey = () => new Date().toISOString().slice(0, 10);
const predDny = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const PLAVANI = {
  workout_date: dnesKey(),
  workout_type: 'plavani',
  workout_name: 'Plavání',
  duration_min: 60,
};

test('ruční trénink se objeví v počtu, minutách i kaloriích', () => {
  const s = computeActivitySummary({ periodId: '30', workouts: [PLAVANI] });

  assert.equal(s.completedWorkouts, 1, 'počet tréninků');
  assert.equal(s.totalMinutes, 60, 'minuty z duration_min');
  // plavání = 9 kcal/min podle sazebníku v progressIntegrity
  assert.equal(s.kcalEstimateSecondary, 540, 'odhad kalorií');
  assert.equal(s.activeDays, 1, 'den se zápisem je aktivní den');
});

test('souhrn vrací konkrétní aktivní dny, ne jen počet', () => {
  const s = computeActivitySummary({
    periodId: '30',
    workouts: [PLAVANI, { ...PLAVANI, workout_date: predDny(3) }],
  });
  assert.ok(Array.isArray(s.activeDayKeys), 'activeDayKeys musí být pole');
  assert.equal(s.activeDayKeys.length, 2);
  assert.ok(s.activeDayKeys.includes(dnesKey()));
});

test('den se zápisem i pohybem ze zařízení je jeden aktivní den', () => {
  // Přesně to sjednocení, které dělá profil: dny ze zařízení + dny ze zápisů.
  const s = computeActivitySummary({ periodId: '30', workouts: [PLAVANI] });
  const zeZarizeni = [dnesKey()];                 // hodinky hlásí pohyb týž den
  const sjednocene = new Set([...zeZarizeni, ...s.activeDayKeys]);
  assert.equal(sjednocene.size, 1, 'nesmí se počítat dvakrát');
});

test('trénink mimo období se nezapočítá', () => {
  const s = computeActivitySummary({
    periodId: '7',
    workouts: [{ ...PLAVANI, workout_date: predDny(20) }],
  });
  assert.equal(s.completedWorkouts, 0);
  assert.equal(s.totalMinutes, 0);
});

test('typ tréninku mění odhad kalorií', () => {
  const beh = computeActivitySummary({
    periodId: '30',
    workouts: [{ ...PLAVANI, workout_type: 'beh' }],
  });
  const chuze = computeActivitySummary({
    periodId: '30',
    workouts: [{ ...PLAVANI, workout_type: 'chuze' }],
  });
  assert.equal(beh.kcalEstimateSecondary, 600);
  assert.equal(chuze.kcalEstimateSecondary, 240);
});

/**
 * Ruční měření nesmí zmizet pod registrační vahou ze stejného dne.
 * Doloženo 15. 8. 2026: uživatel zadal 79,4 kg, řádek se uložil se
 * `source='manual'`, ale v profilu dál svítilo 82,0 kg z registrace —
 * dedup podle data nechával vyhrát pozdější zápis, a registrace proběhla
 * večer, kdežto měření bylo za ráno.
 */
import { normalizeMeasurementPoints } from '../progressIntegrity.js';

test('ruční měření přebije registrační váhu ze stejného dne', () => {
  const den = '2026-08-14';
  const { weightSeries } = normalizeMeasurementPoints({
    bodyMeasurements: [
      { id: 'm1', measured_at: `${den}T10:00:00Z`, weight_kg: 79.4, waist_cm: 88, source: 'manual' },
    ],
    registrationMetric: { id: 'r1', weight_kg: 82, created_at: `${den}T22:46:30Z` },
    registrationMetricId: 'r1',
  });

  assert.equal(weightSeries.length, 1, 'jeden den = jeden bod');
  assert.equal(weightSeries[0].weight_kg, 79.4, 'platí ruční měření, ne registrace');
  assert.equal(weightSeries[0].source, 'manual');
});

test('měření ze zařízení taky přebije registraci ze stejného dne', () => {
  const den = '2026-08-14';
  const { weightSeries } = normalizeMeasurementPoints({
    withingsHistory: [{ date: den, measured_at: `${den}T07:00:00Z`, weight: 80.2 }],
    registrationMetric: { id: 'r1', weight_kg: 82, created_at: `${den}T22:46:30Z` },
    registrationMetricId: 'r1',
  });
  assert.equal(weightSeries[0].weight_kg, 80.2);
  assert.equal(weightSeries[0].source, 'withings');
});

test('dvě ruční měření v jednom dni — platí pozdější', () => {
  const den = '2026-08-14';
  const { weightSeries } = normalizeMeasurementPoints({
    bodyMeasurements: [
      { id: 'a', measured_at: `${den}T07:00:00Z`, weight_kg: 80, source: 'manual' },
      { id: 'b', measured_at: `${den}T19:00:00Z`, weight_kg: 79.4, source: 'manual' },
    ],
  });
  assert.equal(weightSeries.length, 1);
  assert.equal(weightSeries[0].weight_kg, 79.4);
});

test('registrace zůstane, když v ten den nic jiného není', () => {
  const { weightSeries } = normalizeMeasurementPoints({
    registrationMetric: { id: 'r1', weight_kg: 82, created_at: '2026-08-10T22:00:00Z' },
    registrationMetricId: 'r1',
  });
  assert.equal(weightSeries.length, 1);
  assert.equal(weightSeries[0].weight_kg, 82);
  assert.equal(weightSeries[0].source, 'registration');
});
