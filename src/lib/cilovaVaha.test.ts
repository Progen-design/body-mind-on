import test from 'node:test';
import assert from 'node:assert/strict';
import { automatickaCilovaVaha, cilovaVaha } from './cilovaVaha.ts';

test('redukce: 193 cm, 103,6 kg → 93 kg (BMI 24,9 je nad −10 %)', () => {
  assert.equal(automatickaCilovaVaha(103.6, 193, 'redukce'), 93);
});

test('redukce: vysoké BMI → nejvýš −10 % aktuální váhy', () => {
  // 170 cm, 120 kg: BMI 24,9 = 72 kg, −10 % = 108 kg → 108
  assert.equal(automatickaCilovaVaha(120, 170, 'redukce'), 108);
});

test('redukce: už skoro v normě → aspoň o 2 kg níž', () => {
  // 180 cm, 81 kg: BMI 24,9 = 80,7 → min(80,7; 79) = 79
  assert.equal(automatickaCilovaVaha(81, 180, 'redukce'), 79);
});

test('nabírání svalů: +5 %, strop BMI 27, aspoň +2 kg', () => {
  // 180 cm, 70 kg: +5 % = 73,5; BMI 27 = 87,5 → 73,5
  assert.equal(automatickaCilovaVaha(70, 180, 'nabirani_svaly'), 73.5);
  // 165 cm, 72 kg: +5 % = 75,6; BMI 27 = 73,5 → 73,5, ale aspoň +2 → 74
  assert.equal(automatickaCilovaVaha(72, 165, 'nabirani_svaly'), 74);
});

test('udržování a neznámý cíl → aktuální váha', () => {
  assert.equal(automatickaCilovaVaha(64.3, 168, 'udrzovani'), 64.5);
  assert.equal(automatickaCilovaVaha(80, 180, null), 80);
});

test('bez výšky se redukce počítá jen z procent', () => {
  assert.equal(automatickaCilovaVaha(100, null, 'redukce'), 90);
});

test('bez váhy není co počítat', () => {
  assert.equal(automatickaCilovaVaha(null, 180, 'redukce'), null);
  assert.equal(automatickaCilovaVaha(0, 180, 'redukce'), null);
});

test('ručně zadaný cíl má přednost před automatickým', () => {
  assert.deepEqual(cilovaVaha(94, 103.6, 193, 'redukce'), { kg: 94, automaticky: false });
  assert.deepEqual(cilovaVaha(null, 103.6, 193, 'redukce'), { kg: 93, automaticky: true });
  assert.deepEqual(cilovaVaha('', 103.6, 193, 'redukce'), { kg: 93, automaticky: true });
});
