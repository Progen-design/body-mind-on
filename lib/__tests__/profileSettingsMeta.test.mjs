// Cílová váha v PATCH /api/profile-settings: smazat vs. neměnit vs. nastavit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { urciCilovouVahu, slozMetadataVahy } from '../profileSettingsMeta.js';

test('chybějící klíč = neměnit', () => {
  assert.deepEqual(urciCilovouVahu({}), { akce: 'nic', kg: null });
  assert.deepEqual(urciCilovouVahu({ height_cm: 180 }), { akce: 'nic', kg: null });
  assert.deepEqual(urciCilovouVahu(null), { akce: 'nic', kg: null });
});

test('null nebo prázdný text = smazat', () => {
  assert.deepEqual(urciCilovouVahu({ goal_weight_kg: null }), { akce: 'smazat', kg: null });
  assert.deepEqual(urciCilovouVahu({ goal_weight_kg: '' }), { akce: 'smazat', kg: null });
  assert.deepEqual(urciCilovouVahu({ goal_weight_kg: '  ' }), { akce: 'smazat', kg: null });
});

test('číslo = nastavit', () => {
  assert.deepEqual(urciCilovouVahu({ goal_weight_kg: 95.5 }), { akce: 'nastavit', kg: 95.5 });
  assert.deepEqual(urciCilovouVahu({ goal_weight_kg: '80' }), { akce: 'nastavit', kg: 80 });
});

test('smazání zapíše null do metadat, ostatní klíče nechá', () => {
  const meta = slozMetadataVahy(
    { goal_weight_kg: 95, start_weight_kg: 104, wants_body_tracking: true },
    { startWeightKg: null, cil: { akce: 'smazat', kg: null } }
  );
  assert.equal(meta.goal_weight_kg, null, 'cílová váha se musí opravdu smazat');
  assert.equal(meta.start_weight_kg, 104);
  assert.equal(meta.wants_body_tracking, true);
});

test('smazání, když žádný cíl nebyl, nic nepřidává', () => {
  const meta = slozMetadataVahy({ start_weight_kg: 104 }, { startWeightKg: null, cil: { akce: 'smazat', kg: null } });
  assert.ok(!('goal_weight_kg' in meta));
});

test('nastavení a „nic" fungují jako dřív', () => {
  assert.equal(slozMetadataVahy({}, { startWeightKg: null, cil: { akce: 'nastavit', kg: 90 } }).goal_weight_kg, 90);
  assert.equal(slozMetadataVahy({ goal_weight_kg: 95 }, { startWeightKg: 100, cil: { akce: 'nic', kg: null } }).goal_weight_kg, 95);
  assert.equal(slozMetadataVahy({}, { startWeightKg: 100, cil: { akce: 'nic', kg: null } }).start_weight_kg, 100);
});

test('endpoint používá pomocné funkce a odmítne nečíselný cíl', () => {
  const zdroj = fs.readFileSync('api/profile-settings.js', 'utf8');
  assert.match(zdroj, /urciCilovouVahu\(body\)/);
  assert.match(zdroj, /slozMetadataVahy\(currentMeta/);
  assert.match(zdroj, /Number\.isFinite\(goal_weight_kg\)/);
});
