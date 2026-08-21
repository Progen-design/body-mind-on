/**
 * BEZ DAT ŽÁDNÝ ZÁVĚR.
 *
 * Stránka Apple Watch ukazovala hodnotící texty NAD hláškou „Zatím nemáme
 * dostatek dat“ — tedy zdravotní tvrzení bez podkladu, což projekt zakazuje
 * (viz BMON_MASTER_CONTEXT, sekce tone of voice: žádné diagnózy).
 *
 * PŘÍČINA BYLA JEDNA A OPAKOVALA SE: `Number(null)` je 0 a `Number.isFinite(0)`
 * je true, takže stráž `if (!Number.isFinite(Number(v))) return null` prázdnou
 * hodnotu propustila a funkce z ní vyrobila tvrzení:
 *
 *   getStepsChartStatus(null)      → „Dnes 0 kroků. Málo pohybu.“
 *   getHrvChartStatus(null, null)  → 0 < 0 je false → „Nad průměrem — dobrá regenerace.“
 *   getRhrChartStatus(null, null)  → 0 > 0+3 je false → „V normě, tělo je v pohodě.“
 *   getActiveEnergyChartStatus(null) → „Dnes 0,00 kcal spáleno pohybem.“
 *
 * Ta nula nebyla naměřená. Test proto rozlišuje „nevím“ (null → žádný text)
 * od „naměřená nula“ (0 → text smí být, je to skutečný údaj).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getHrvChartStatus,
  getRhrChartStatus,
  getStepsChartStatus,
  getActiveEnergyChartStatus,
  formatMetricValue,
} from '../formatters.ts';
import { getMetricInsight, formatRecoveryDrivers, buildHealthDailyInsight } from '../insights.ts';

const PRAZDNE = [null, undefined, ''] as const;

test('chybějící data nevyrobí žádný hodnotící text', () => {
  for (const v of PRAZDNE) {
    assert.equal(getStepsChartStatus(v as never), null, `kroky: ${String(v)}`);
    assert.equal(getActiveEnergyChartStatus(v as never), null, `energie: ${String(v)}`);
    assert.equal(getHrvChartStatus(v as never, v as never), null, `HRV: ${String(v)}`);
    assert.equal(getRhrChartStatus(v as never, v as never), null, `klidový tep: ${String(v)}`);
  }
});

test('chybí i jen jedna strana srovnání → žádný závěr', () => {
  assert.equal(getHrvChartStatus(45, null), null, 'HRV bez průměru');
  assert.equal(getHrvChartStatus(null, 45), null, 'průměr bez HRV');
  assert.equal(getRhrChartStatus(58, null), null, 'tep bez průměru');
  assert.equal(getRhrChartStatus(null, 58), null, 'průměr bez tepu');
});

test('naměřená nula závěr mít SMÍ — je to skutečný údaj', () => {
  assert.match(getStepsChartStatus(0) ?? '', /0 kroků/);
  assert.match(getActiveEnergyChartStatus(0) ?? '', /kcal/);
});

test('reálná data se chovají beze změny', () => {
  assert.match(getStepsChartStatus(3000) ?? '', /Málo pohybu/);
  assert.match(getStepsChartStatus(12000) ?? '', /Skvělý den/);
  assert.match(getHrvChartStatus(60, 50) ?? '', /Nad průměrem/);
  assert.match(getHrvChartStatus(40, 50) ?? '', /zatížené/);
  assert.match(getRhrChartStatus(65, 55) ?? '', /Zvýšený/);
  assert.match(getRhrChartStatus(55, 55) ?? '', /V normě/);
});

test('formatMetricValue: prázdno je „—“, ne nula', () => {
  for (const v of PRAZDNE) assert.equal(formatMetricValue(v, 'count'), '—', String(v));
  assert.equal(formatMetricValue(0, 'count'), '0', 'naměřená nula se zobrazí');
});

test('getMetricInsight bez hodnoty nedoporučuje nic', () => {
  for (const v of PRAZDNE) {
    assert.equal(getMetricInsight('step_count', v), null);
    assert.equal(getMetricInsight('apple_exercise_time', v), null);
  }
  assert.ok(getMetricInsight('step_count', 3000));
});

test('drivery regenerace bez odchylek nic netvrdí', () => {
  const prazdny = {
    hrv_delta_pct: null, rhr_delta_bpm: null, sleep_asleep_min: null,
  } as never;
  assert.deepEqual(formatRecoveryDrivers(prazdny), [],
    'z chybějících odchylek nesmí vzniknout „Blízko tvého průměru“');
});

test('doporučení nevzniknou z chybějících kroků', () => {
  const out = buildHealthDailyInsight({
    recoveryRows: [{ recovery_status: 'ok', recovery_score: 80, steps: null, exercise_min: null, local_date: '2026-08-18' }],
    watchRows: [],
    workoutRows: [],
  } as never);
  const vse = (out.recommendations || []).join(' | ');
  assert.doesNotMatch(vse, /Málo kroků/, `z chybějících kroků vzniklo doporučení: ${vse}`);
});
