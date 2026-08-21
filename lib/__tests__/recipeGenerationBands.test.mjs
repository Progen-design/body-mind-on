/**
 * Kalorická pásma objednávek.
 *
 * Chyba, kterou to opravuje: seed objednávky snídaní s pásmem 350–550
 * a 400–550 skončily bez jediného receptu (0 z 6 položek), protože medián
 * toho, co model u snídaně vyrobí, je 392 kcal. Zaplatili jsme za generování
 * a nedostali nic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SIRKA_PASMA,
  ROZSAHY_CHODU,
  jePasmoNesplnitelne,
  srovnejPasmo,
} from '../recipeGenerationBands.js';

test('snídaňové pásmo 400–550 se srovná pod medián produkce', () => {
  // Presne zadani polozek 1279 a 1281, ktere skoncily bez receptu.
  const v = srovnejPasmo({ meal_type: 'snidane', kcal_min: 400, kcal_max: 550 });
  assert.equal(v.kcal_min, 300);
  assert.ok(v.kcal_max >= 520);
  assert.equal(v.zmeneno, true);
  assert.match(v.duvod.join(' '), /spodni hranice 400 -> 300/);
});

test('pásmo 350–550 taky — nula úspěchů ze tří položek', () => {
  const v = srovnejPasmo({ meal_type: 'snidane', kcal_min: 350, kcal_max: 550 });
  assert.equal(v.kcal_min, 300);
  assert.equal(v.zmeneno, true);
});

test('pásmo, které fungovalo, se nemění', () => {
  // 300–550 dalo 3 recepty ze 4 polozek.
  const v = srovnejPasmo({ meal_type: 'snidane', kcal_min: 300, kcal_max: 550 });
  assert.equal(v.kcal_min, 300);
  assert.equal(v.kcal_max, 550);
  assert.equal(v.zmeneno, false);
  assert.deepEqual(v.duvod, []);
});

test('obědové 450–650 dostane vyšší strop', () => {
  // 450–650: 2 polozky, 2 selhani. 450–700: 4 hotove.
  const v = srovnejPasmo({ meal_type: 'obed', kcal_min: 450, kcal_max: 650 });
  assert.equal(v.kcal_min, 450);
  assert.equal(v.kcal_max, 680);
  assert.equal(v.zmeneno, true);
});

test('i poptávkové pásmo se spodní hranicí nad p10 se uvolní', () => {
  // `objednejZNevyresenehoSlotu` pocita cil/2 az cil*2. U vecere to dalo
  // 350–850, jenze p10 produkce je 300. Davka potrebuje PET receptu v pasmu,
  // takze i mirne useknuty spodek se projevi: pri 70 % zasahu je sance na pet
  // za sebou 17 %. Uvolneni dolu nic nestoji — slot si porci doskaluje
  // (0,5–2,0x), objednava se zakladni kcal receptu, ne cil slotu.
  const v = srovnejPasmo({ meal_type: 'vecere', kcal_min: 350, kcal_max: 850 });
  assert.equal(v.kcal_min, 300);
  assert.equal(v.kcal_max, 850, 'siroky strop se nesnizuje');
  assert.equal(v.zmeneno, true);
});

test('úzké pásmo se rozšíří na minimální šířku', () => {
  const v = srovnejPasmo({ meal_type: 'svacina', kcal_min: 170, kcal_max: 200 });
  assert.ok(v.kcal_max - v.kcal_min >= MIN_SIRKA_PASMA);
  assert.match(v.duvod.join(' '), /pasmo rozsireno/);
});

test('neznámý chod se nechává být — nehádá se, co jsme neměřili', () => {
  const v = srovnejPasmo({ meal_type: 'brunch', kcal_min: 900, kcal_max: 950 });
  assert.equal(v.kcal_min, 900);
  assert.equal(v.kcal_max, 950);
  assert.equal(v.zmeneno, false);
});

test('chybějící nebo nesmyslné hodnoty nespadnou', () => {
  assert.equal(srovnejPasmo({}).zmeneno, false);
  assert.equal(srovnejPasmo().zmeneno, false);
  assert.equal(srovnejPasmo({ meal_type: 'snidane', kcal_min: null, kcal_max: null }).zmeneno, false);
  assert.equal(srovnejPasmo({ meal_type: 'snidane', kcal_min: 'x', kcal_max: 'y' }).zmeneno, false);
});

test('úprava se nikdy neděje potichu', () => {
  const v = srovnejPasmo({ meal_type: 'snidane', kcal_min: 450, kcal_max: 500 });
  assert.equal(v.zmeneno, true);
  assert.ok(v.duvod.length > 0, 'změna zadání musí mít zapsaný důvod');
});

test('srovnané pásmo už je stabilní — druhý průchod nic nezmění', () => {
  const prvni = srovnejPasmo({ meal_type: 'snidane', kcal_min: 400, kcal_max: 550 });
  const druhy = srovnejPasmo({ meal_type: 'snidane', ...prvni });
  assert.equal(druhy.zmeneno, false);
});

test('nesplnitelné pásmo se pozná', () => {
  // Cele nad tim, co model u snidane tvori (max 542).
  assert.equal(jePasmoNesplnitelne({ meal_type: 'snidane', kcal_min: 700, kcal_max: 900 }), true);
  // Cele pod.
  assert.equal(jePasmoNesplnitelne({ meal_type: 'obed', kcal_min: 100, kcal_max: 200 }), true);
  // Bezne pasmo ne.
  assert.equal(jePasmoNesplnitelne({ meal_type: 'snidane', kcal_min: 300, kcal_max: 550 }), false);
  assert.equal(jePasmoNesplnitelne({ meal_type: 'brunch', kcal_min: 1, kcal_max: 2 }), false);
});

test('každý měřený chod má obě hranice', () => {
  for (const [chod, r] of Object.entries(ROZSAHY_CHODU)) {
    assert.ok(r.spodni_strop > 0, `${chod}: chybí spodní strop`);
    assert.ok(r.horni_podlaha > r.spodni_strop, `${chod}: horní podlaha není nad spodním stropem`);
  }
});
