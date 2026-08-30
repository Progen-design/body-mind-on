import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuickWeightRow } from '../quickWeightRow.js';

// Pole, která se u ručního vážení vědomě přepisují — všechno ostatní musí
// z předchozího řádku přežít beze změny. Test drží pravidlo z
// docs/DALSI_KROK.md 6.4: ruční výčet polí v api/quick-weight.js byl příčina
// bugu, který smazal diet_type/workout_days/cíle výživy.
const PREPISOVANA_POLE = new Set(['id', 'created_at', 'weight_kg', 'bmi']);

const LATEST = Object.freeze({
  id: 'stary-radek-id',
  user_id: 'u1',
  height_cm: 170,
  weight_kg: 62,
  age: 30,
  bmi: 21.45,
  tdee: 2100,
  notes: 'Kde cvičí: Doma s vybavením. Pomůcky: Jednoručky',
  created_at: '2026-08-29T01:54:47.000Z',
  email: 'test@example.com',
  name: 'Testerka',
  gender: 'female',
  stress_level: 'stredne',
  occupation: 'office_it',
  activity: 'stredne',
  goal: 'redukce',
  freq_choice: '3x',
  weekly_sessions_user: 3,
  calories_target: 1436,
  program: 'START',
  diet_type: 'vegetarian',
  dietary_restrictions: 'bez ořechů',
  foods_to_avoid: null,
  workout_days: '1,3,5',
  birth_date: '1996-01-01',
  devices: ['scale'],
  protein_target_g: 112,
  carbs_target_g: 140,
  fat_target_g: 45,
});

test('nový řádek zdědí všechna pole z předchozího kromě těch, co se vědomě přepisují', () => {
  const row = buildQuickWeightRow(LATEST, { userId: 'u1', weightKg: 61.4, createdAt: '2026-08-29T02:07:36.000Z' });

  for (const [pole, hodnota] of Object.entries(LATEST)) {
    if (PREPISOVANA_POLE.has(pole)) continue;
    assert.deepEqual(row[pole], hodnota, `pole "${pole}" se u ručního vážení ztratilo nebo změnilo`);
  }
});

test('žádné vyplněné pole z předchozího řádku nesmí v novém skončit jako NULL — kromě přepisovaných', () => {
  const row = buildQuickWeightRow(LATEST, { userId: 'u1', weightKg: 61.4, createdAt: '2026-08-29T02:07:36.000Z' });

  for (const [pole, hodnota] of Object.entries(LATEST)) {
    if (PREPISOVANA_POLE.has(pole)) continue;
    if (hodnota === null) continue;
    assert.notEqual(row[pole], null, `pole "${pole}" bylo vyplněné a po vážení je NULL`);
    assert.notEqual(row[pole], undefined, `pole "${pole}" bylo vyplněné a po vážení chybí`);
  }
});

test('id se negeneruje ručně — DB má dostat čerstvý řádek, ne cizí identitu', () => {
  const row = buildQuickWeightRow(LATEST, { userId: 'u1', weightKg: 61.4, createdAt: '2026-08-29T02:07:36.000Z' });
  assert.equal('id' in row, false);
});

test('weight_kg a created_at se nastaví na nové hodnoty', () => {
  const row = buildQuickWeightRow(LATEST, { userId: 'u1', weightKg: 61.4, createdAt: '2026-08-29T02:07:36.000Z' });
  assert.equal(row.weight_kg, 61.4);
  assert.equal(row.created_at, '2026-08-29T02:07:36.000Z');
});

test('bmi se dopočítá z nové váhy, ne zkopíruje ze staré', () => {
  const row = buildQuickWeightRow(LATEST, { userId: 'u1', weightKg: 61.4, createdAt: '2026-08-29T02:07:36.000Z' });
  assert.notEqual(row.bmi, LATEST.bmi);
  // 61.4 / (1.70^2) = 21.24
  assert.equal(row.bmi, 21.2);
});

test('calories_target a makra se NEPŘEPOČÍTAVAJÍ — zůstávají z předchozího řádku', () => {
  const row = buildQuickWeightRow(LATEST, { userId: 'u1', weightKg: 61.4, createdAt: '2026-08-29T02:07:36.000Z' });
  assert.equal(row.calories_target, 1436);
  assert.equal(row.protein_target_g, 112);
  assert.equal(row.carbs_target_g, 140);
  assert.equal(row.fat_target_g, 45);
});
