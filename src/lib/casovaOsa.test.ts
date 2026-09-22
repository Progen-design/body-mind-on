import test from 'node:test';
import assert from 'node:assert/strict';
import { sestavCasovouOsu, casNaMinuty } from './casovaOsa.ts';
import type { MealItem } from '../types.ts';

const jidlo = (id: string, type: MealItem['type'], time: string, completed = false): MealItem =>
  ({ id, type, time, title: `Jídlo ${id}`, calories: 400, protein: 0, carbs: 0, fat: 0, completed, ingredients: [] }) as unknown as MealItem;

const DEN = [
  jidlo('1', 'Snídaně', '7:30'),
  jidlo('2', 'Dopolední svačina', '10:00'),
  jidlo('3', 'Oběd', '12:30'),
  jidlo('4', 'Odpolední svačina', '15:30'),
  jidlo('5', 'Večeře', '19:00'),
];
const TRENINK = { nazev: 'Trénink A', delkaMin: 45, hotovo: false };

// 21. 9. 2026, léto v Praze = UTC+2
const v = (hodina: number, minuta = 0) => new Date(Date.UTC(2026, 8, 21, hodina - 2, minuta));

test('trénink jde za oběd: Snídaně → Svačina → Oběd → Trénink → Svačina → Večeře', () => {
  const { polozky } = sestavCasovouOsu(DEN, TRENINK, v(8));
  assert.deepEqual(polozky.map((p) => p.stitek), [
    'Snídaně', 'Dopolední svačina', 'Oběd', 'Trénink', 'Odpolední svačina', 'Večeře',
  ]);
});

test('trénink nemá vymyšlený čas, jídla mají čas z plánu', () => {
  const { polozky } = sestavCasovouOsu(DEN, TRENINK, v(8));
  assert.equal(polozky.find((p) => p.typ === 'trenink')?.cas, null);
  assert.equal(polozky[0].cas, '7:30');
  assert.equal(polozky.find((p) => p.typ === 'trenink')?.udaj, '45 min');
  assert.equal(polozky[0].udaj, '400 kcal');
});

test('bez oběda se trénink zařadí odpoledne podle času', () => {
  const bezObeda = DEN.filter((m) => m.type !== 'Oběd');
  const { polozky } = sestavCasovouOsu(bezObeda, TRENINK, v(8));
  const i = polozky.findIndex((p) => p.typ === 'trenink');
  assert.equal(polozky[i - 1].stitek, 'Odpolední svačina');
  assert.equal(polozky[i + 1].stitek, 'Večeře');
});

test('den bez tréninku nemá položku tréninku', () => {
  const { polozky } = sestavCasovouOsu(DEN, null, v(8));
  assert.equal(polozky.length, 5);
  assert.ok(!polozky.some((p) => p.typ === 'trenink'));
});

test('značka „Teď" leží za položkami, jejichž čas už nastal', () => {
  assert.equal(sestavCasovouOsu(DEN, TRENINK, v(6)).tedPredIndexem, 0);
  assert.equal(sestavCasovouOsu(DEN, TRENINK, v(8)).tedPredIndexem, 1);
  // 13:00: snídaně, svačina, oběd a trénink (hned za obědem) už „nastaly"
  assert.equal(sestavCasovouOsu(DEN, TRENINK, v(13)).tedPredIndexem, 4);
  assert.equal(sestavCasovouOsu(DEN, TRENINK, v(22)).tedPredIndexem, 6);
});

test('čas se bere v Praze, ne v UTC', () => {
  // 06:00 UTC = 08:00 v Praze → snídaně (7:30) je za námi
  assert.equal(sestavCasovouOsu(DEN, null, new Date('2026-09-21T06:00:00Z')).tedPredIndexem, 1);
});

test('prázdný den nemá značku „Teď"', () => {
  const osa = sestavCasovouOsu([], null, v(8));
  assert.deepEqual(osa.polozky, []);
  assert.equal(osa.tedPredIndexem, null);
});

test('hotové položky se neztratí, jídlo bez rozpoznatelného času jde na konec', () => {
  const s = [jidlo('1', 'Snídaně', '7:30', true), jidlo('2', 'Večeře', 'večer')];
  const { polozky } = sestavCasovouOsu(s, null, v(8));
  assert.equal(polozky[0].hotovo, true);
  assert.equal(polozky[1].cas, null);
});

test('casNaMinuty', () => {
  assert.equal(casNaMinuty('7:30'), 450);
  assert.equal(casNaMinuty('19:05'), 1145);
  assert.equal(casNaMinuty('večer'), null);
});

test('rozpracovaný trénink ukáže postup místo délky, hotový zůstane hotový', () => {
  const rozp = sestavCasovouOsu(DEN, { ...TRENINK, rozpracovano: { hotovo: 2, celkem: 4 } }, v(8));
  const t = rozp.polozky.find((p) => p.typ === 'trenink');
  assert.equal(t?.udaj, '2 z 4 cviků');
  assert.equal(t?.hotovo, false, 'Hotovo až po všech cvicích');

  const hotovo = sestavCasovouOsu(DEN, { ...TRENINK, hotovo: true, rozpracovano: null }, v(8));
  assert.equal(hotovo.polozky.find((p) => p.typ === 'trenink')?.hotovo, true);
  assert.equal(hotovo.polozky.find((p) => p.typ === 'trenink')?.udaj, '45 min');
});
