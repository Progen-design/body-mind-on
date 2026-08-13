/**
 * DOLNÍ LIMIT KALORICKÉHO CÍLE — a to, že platí i pro PŘEPOČTENOU hodnotu.
 *
 * ZJIŠTĚNÍ Z 13. 8. 2026. Limit „ženy 1200 kcal, 0,8× BMR" v kódu neexistoval.
 * Byl tu jen plochý `clamp(calories, 1200, 6000)` bez pohlaví a bez BMR.
 * Dokud se cíl počítal jen při registraci, moc to nevadilo. Jakmile se začne
 * přepočítávat z odvozené váhy každý týden, hubnoucí člověk klesá dál a dál
 * a plochá podlaha ho zastaví až na 1200 kcal — bez ohledu na to, že jeho
 * bazální metabolismus je 1900.
 *
 * Testuje se hlavně to, že limit není jen v registrační cestě.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNutritionTargets,
  bmrMifflinStJeor,
  minimalniKalorickyCil,
  MIN_KCAL_ZENA,
  MIN_KCAL_MUZ,
} from '../nutritionTargets.js';
import { cilProVahu, vyhodnotPrepocet } from '../weeklyWeightRecalc.js';

test('BMR podle Mifflin–St Jeor', () => {
  // muž 80 kg, 180 cm, 30 let: 10*80 + 6.25*180 - 5*30 + 5 = 1780
  assert.equal(bmrMifflinStJeor({ weightKg: 80, heightCm: 180, age: 30, gender: 'male' }), 1780);
  // žena stejných parametrů: -161 místo +5 → 1614
  assert.equal(bmrMifflinStJeor({ weightKg: 80, heightCm: 180, age: 30, gender: 'female' }), 1614);
});

test('bez výšky nebo věku se BMR nedohaduje', () => {
  assert.equal(bmrMifflinStJeor({ weightKg: 80, age: 30, gender: 'male' }), null);
  assert.equal(bmrMifflinStJeor({ weightKg: 80, heightCm: 180, gender: 'male' }), null);
  assert.equal(bmrMifflinStJeor({}), null);

  // Limit pak spadne na genderové minimum — pořád chrání, jen hruběji.
  const bezVysky = minimalniKalorickyCil({ weightKg: 80, gender: 'female' });
  assert.equal(bezVysky.limit, MIN_KCAL_ZENA);
  assert.equal(bezVysky.bmr, null);
});

test('limit je max z genderového minima a 0,8× BMR', () => {
  // Žena 80/180/30: BMR 1614, 0,8× = 1291 > 1200 → rozhoduje BMR.
  const zena = minimalniKalorickyCil({ weightKg: 80, heightCm: 180, age: 30, gender: 'female' });
  assert.equal(zena.limit, 1291);

  // Drobná žena: BMR nízké, 0,8× pod 1200 → rozhoduje absolutní minimum.
  const drobna = minimalniKalorickyCil({ weightKg: 45, heightCm: 155, age: 60, gender: 'female' });
  assert.ok(Math.round(0.8 * drobna.bmr) < MIN_KCAL_ZENA);
  assert.equal(drobna.limit, MIN_KCAL_ZENA, 'pod 1200 se u žen nesmí spadnout nikdy');

  // Muž 80/180/30: BMR 1780, 0,8× = 1424 < 1500 → rozhoduje mužské minimum.
  const muz = minimalniKalorickyCil({ weightKg: 80, heightCm: 180, age: 30, gender: 'male' });
  assert.equal(muz.limit, MIN_KCAL_MUZ);
});

test('limit platí pro PŘEPOČTENOU hodnotu, ne jen pro registrační', () => {
  // Žena v redukci, po zhubnutí. Vzorec (w*28-300)*mul dá hodně málo.
  const bm = { gender: 'female', height_cm: 165, age: 35, goal: 'redukce', activity: 'nizka' };

  const cile = cilProVahu(bm, 52);
  const limit = minimalniKalorickyCil({ weightKg: 52, heightCm: 165, age: 35, gender: 'female' });

  assert.equal(cile.calories_target, limit.limit, 'přepočet se musí opřít o limit');
  assert.equal(cile.floor_applied, true, 'a musí to přiznat, aby to šlo zalogovat');
  assert.ok(cile.calories_target >= MIN_KCAL_ZENA);
});

test('limit se počítá z odvozené váhy, ne z registrační', () => {
  // Registračně 95 kg, dnes 60 kg. Limit musí odpovídat dnešku.
  const bm = { gender: 'female', height_cm: 165, age: 35, weight_kg: 95, goal: 'redukce' };

  const proDnesek = minimalniKalorickyCil({ weightKg: 60, heightCm: 165, age: 35, gender: 'female' });
  const proRegistraci = minimalniKalorickyCil({ weightKg: 95, heightCm: 165, age: 35, gender: 'female' });
  assert.notEqual(proDnesek.limit, proRegistraci.limit, 'limity se musí lišit, jinak test nic netestuje');

  const cile = cilProVahu(bm, 60);
  assert.ok(
    cile.calories_target >= proDnesek.limit,
    'podlaha musí patřit stejnému člověku jako strop'
  );
});

test('normální případ limitem neprochází a nehlásí ho', () => {
  const bm = { gender: 'male', height_cm: 180, age: 30, goal: 'udrzovani', activity: 'stredne' };
  const cile = cilProVahu(bm, 80);

  assert.ok(cile.calories_target > 2000);
  assert.equal(cile.floor_applied, false);
});

test('přepočet nesahá na cíl, když měření chybí', () => {
  const bm = { gender: 'female', height_cm: 165, age: 35, weight_kg: 70, calories_target: 1900 };

  for (const odvozena of [
    { weight_kg: null, duvod: 'zadna_mereni', pocet_mereni: 0, okno: null },
    { weight_kg: null, duvod: 'starsi_nez_14_dni', pocet_mereni: 0, okno: null },
    null,
  ]) {
    const v = vyhodnotPrepocet(bm, odvozena);
    assert.equal(v.zmenit, false, 'bez měření se cíl nemění');
    assert.equal(v.novyCil, null);
  }
});

test('přepočet nesahá na cíl kvůli šumu pod 0,3 kg', () => {
  const bm = { gender: 'female', height_cm: 165, age: 35, weight_kg: 70, calories_target: 1900 };
  const v = vyhodnotPrepocet(bm, { weight_kg: 70.2, duvod: 'ok', pocet_mereni: 5, okno: '7d' });

  assert.equal(v.zmenit, false);
  assert.equal(v.duvod, 'bez_zmeny_vaha_stejna');
});

test('reálná změna váhy cíl přepočítá a nese důvod i obě hodnoty', () => {
  const bm = { gender: 'female', height_cm: 165, age: 35, weight_kg: 70, calories_target: 1900, goal: 'redukce' };
  const v = vyhodnotPrepocet(bm, { weight_kg: 66, duvod: 'ok', pocet_mereni: 6, okno: '7d' });

  assert.equal(v.zmenit, true);
  assert.equal(v.duvod, 'prepocet_z_odvozene_vahy');
  assert.equal(v.staryCil, 1900);
  assert.ok(v.novyCil > 0 && v.novyCil !== 1900);
});

test('širší okno se v důvodu odliší — nouzový režim musí být v auditu vidět', () => {
  const bm = { gender: 'female', height_cm: 165, age: 35, weight_kg: 70, calories_target: 1900, goal: 'redukce' };
  const v = vyhodnotPrepocet(bm, { weight_kg: 66, duvod: 'ok', pocet_mereni: 2, okno: '14d' });

  assert.equal(v.zmenit, true);
  assert.equal(v.duvod, 'prepocet_z_odvozene_vahy_sirsi_okno');
});

test('registrační výpočet limit taky respektuje (stejná funkce, obě cesty)', () => {
  // Nízký uložený calories_target z registrace se nesmí protlačit pod limit.
  const targets = calculateNutritionTargets({
    bodyMetrics: {
      gender: 'female', height_cm: 165, age: 35, weight_kg: 52, calories_target: 1050,
    },
  });
  const limit = minimalniKalorickyCil({ weightKg: 52, heightCm: 165, age: 35, gender: 'female' });

  assert.ok(targets.calories_target >= limit.limit);
  assert.equal(targets.floor_applied, true);
});
