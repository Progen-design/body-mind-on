import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyWeightRecord,
  buildSyncedBiometrics,
  buildSyncedWeightRecord,
  formatLastSynced,
  formatSyncSource
} from './syncEngine.ts';
import { appleWatchBiometricsData, initialWeightRecords } from '../data/initialData.ts';

/** Pevný čas, ať testy nezávisí na tom, kdy běží. */
const NOW = new Date(2026, 7, 21, 14, 5); // 21.08.2026 14:05

test('formatLastSynced a formatSyncSource nesou skutečný čas', () => {
  assert.equal(formatLastSynced(NOW), 'dnes v 14:05');
  assert.match(formatSyncSource(NOW), /^Dnes v 14:05 přes Withings Cloud/);
});

test('synchronizace opravdu změní biometrii, ne jen časové razítko', () => {
  const next = buildSyncedBiometrics(appleWatchBiometricsData, NOW);

  assert.notEqual(next.lastSyncTime, appleWatchBiometricsData.lastSyncTime);
  // Kroky se pocitaji z denni doby, takze se od seedu museji lisit.
  assert.notEqual(next.stepsToday, appleWatchBiometricsData.stepsToday);
  assert.ok(next.hrvMs > 0 && next.restingHrBpm > 0);
});

test('hodnoty z hodinek zůstávají ve fyziologických mezích i po 200 synchronizacích', () => {
  let bio = appleWatchBiometricsData;

  for (let i = 0; i < 200; i++) {
    bio = buildSyncedBiometrics(bio, NOW);

    assert.ok(bio.hrvMs >= 16 && bio.hrvMs <= 68, `HRV mimo meze: ${bio.hrvMs}`);
    assert.ok(
      bio.restingHrBpm >= 48 && bio.restingHrBpm <= 82,
      `klidovy tep mimo meze: ${bio.restingHrBpm}`
    );
    assert.ok(
      bio.bloodOxygenPercent >= 92 && bio.bloodOxygenPercent <= 100,
      `SpO2 mimo meze: ${bio.bloodOxygenPercent}`
    );
    assert.ok(
      bio.recoveryScore >= 12 && bio.recoveryScore <= 99,
      `skore regenerace mimo meze: ${bio.recoveryScore}`
    );
  }
});

test('HRV se vrací k baseline, nedriftuje trvale dolů', () => {
  // Seed ma HRV 20,6 ms pri baseline 42 ms — po serii synchronizaci se ma priblizit.
  let bio = appleWatchBiometricsData;
  for (let i = 0; i < 40; i++) bio = buildSyncedBiometrics(bio, NOW);

  const odchylkaPred = Math.abs(appleWatchBiometricsData.hrvMs - appleWatchBiometricsData.hrvBaselineMs);
  const odchylkaPo = Math.abs(bio.hrvMs - bio.hrvBaselineMs);

  assert.ok(odchylkaPo < odchylkaPred, `HRV se nepriblizilo k baseline: ${bio.hrvMs} ms`);
});

test('trendy drží 7 bodů a dnešek přepisují místo přidávání', () => {
  let bio = buildSyncedBiometrics(appleWatchBiometricsData, NOW);
  const poPrvni = bio.hrvTrend.length;

  for (let i = 0; i < 5; i++) bio = buildSyncedBiometrics(bio, NOW);

  assert.equal(bio.hrvTrend.length, poPrvni);
  assert.ok(bio.hrvTrend.length <= 7);
  assert.equal(bio.hrvTrend[bio.hrvTrend.length - 1].day, '21.8.');
  assert.equal(bio.stepsTrend[bio.stepsTrend.length - 1].value, bio.stepsToday);
});

test('nové vážení je konzistentní: svaly nepřesáhnou váhu', () => {
  const last = initialWeightRecords['1M'][initialWeightRecords['1M'].length - 1];

  for (let i = 0; i < 100; i++) {
    const record = buildSyncedWeightRecord(last, NOW);
    assert.equal(record.date, '21.08.');
    assert.ok(record.muscleKg < record.weight, 'svalova hmota vetsi nez vaha');
    assert.ok(record.fatPercent > 0 && record.fatPercent < 60);
    assert.ok(Math.abs(record.weight - last.weight) <= 0.6, 'skok vahy je neprirozene velky');
  }
});

test('opakovaná synchronizace v jeden den graf nenafoukne', () => {
  const record = buildSyncedWeightRecord(
    initialWeightRecords['1M'][initialWeightRecords['1M'].length - 1],
    NOW
  );

  const poPrvni = applyWeightRecord(initialWeightRecords, record, NOW);
  const delkyPoPrvni = Object.fromEntries(
    Object.entries(poPrvni).map(([k, v]) => [k, v.length])
  );

  let dalsi = poPrvni;
  for (let i = 0; i < 10; i++) {
    dalsi = applyWeightRecord(dalsi, buildSyncedWeightRecord(record, NOW), NOW);
  }

  for (const [filtr, delka] of Object.entries(delkyPoPrvni)) {
    assert.equal(dalsi[filtr].length, delka, `rada ${filtr} narostla pri opakovanem syncu`);
  }
});

test('roční přehled dostane měsíční popisek, ostatní řady denní', () => {
  const record = buildSyncedWeightRecord(
    initialWeightRecords['1M'][initialWeightRecords['1M'].length - 1],
    NOW
  );
  const vysledek = applyWeightRecord(initialWeightRecords, record, NOW);

  assert.equal(vysledek['1R'][vysledek['1R'].length - 1].date, '08.2026');
  assert.equal(vysledek['1M'][vysledek['1M'].length - 1].date, '21.08.');
});

test('applyWeightRecord nemutuje vstup', () => {
  const puvodniDelka = initialWeightRecords['1M'].length;
  const record = buildSyncedWeightRecord(
    initialWeightRecords['1M'][initialWeightRecords['1M'].length - 1],
    NOW
  );

  applyWeightRecord(initialWeightRecords, record, NOW);

  assert.equal(initialWeightRecords['1M'].length, puvodniDelka);
});
