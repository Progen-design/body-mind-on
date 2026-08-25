/**
 * Odvozene dietni tagy.
 *
 * PROC. `gluten_free` se zapisoval tak, jak ho vratil model. Ctyri aktivni
 * recepty oznacene jako bezlepkove obsahovaly celozrnny chleb, toast nebo
 * musli (id 963, 1214, 1530, 1531). Celiak by od nas dostal lepek.
 *
 * Autorita je brana v DB, ktera oba tagy prepocitava. Tenhle test hlida to,
 * co se z JS overit da: PRAH a to, ze se s migraci nerozesel.
 *
 * ===========================================================================
 * CO TENHLE SOUBOR CHYTIT NEUMI
 * ===========================================================================
 * Vsechno pod `assert.match(sql, ...)` je REGEX NAD TEXTEM SOUBORU. Overuje,
 * ze v migraci stoji urcity retezec — ne ze to SQL funguje. Typy, syntax
 * a chovani Postgresu jsou pro takovy test neviditelne.
 *
 * Neni to teorie: 24. 8. 2026 spadla migrace 20260824120000 v produkci na
 * `v_tagy || 'low_carb'` (netypovany literal, 22P02 malformed array literal)
 * a testy tady byly zelene, protoze hledany retezec v souboru byl.
 *
 * Chovani se overuje v lib/__tests__/db/odvozeneTagy.db.test.mjs, ktery se
 * pripoji k databazi a funkci opravdu zavola (`npm run test:db`).
 * Kdyz sem pridavas dalsi `assert.match` nad SQL, zeptej se, jestli to, co
 * overujes, nepatri spis tam.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  bezOdvozenychTagu,
  jeLowCarb,
  ODVOZENE_TAGY,
  PRAH_LOW_CARB,
  podilSacharidu,
} from '../dietTagy.js';

const MIGRACE = 'supabase/migrations/20260824120000_lepek_a_odvozene_dietni_tagy.sql';
const sql = fs.readFileSync(MIGRACE, 'utf8');

// ------------------------------------------------------------------ prah

test('prah low_carb se v SQL a v JS rovna', () => {
  const shody = [...sql.matchAll(/podil_sacharidu\([^)]*\)\s*<=\s*([0-9.]+)/g)].map((m) => Number(m[1]));

  assert.equal(shody.length, 1, `v migraci ma byt prave jeden prah, nalezeno ${shody.length}`);
  assert.equal(shody[0], PRAH_LOW_CARB, 'migrace a lib/dietTagy.js se rozesly');
});

test('podil sacharidu se pocita z maker', () => {
  // 30 g sacharidu pri 400 kcal = 120 ze 400 = 30 %.
  assert.equal(Math.round(podilSacharidu(400, 30) * 100), 30);
});

test('bez maker se podil nepocita a tag se neprideli', () => {
  // "Nevime" neni "nizkosacharidove".
  assert.equal(podilSacharidu(0, 10), null);
  assert.equal(podilSacharidu(400, null), null);
  assert.equal(jeLowCarb({ kcal: 400 }), false);
  assert.equal(jeLowCarb({}), false);
  assert.equal(jeLowCarb(null), false);
});

test('recept pod prahem tag dostane, nad prahem ne', () => {
  assert.equal(jeLowCarb({ kcal: 400, carbs_g: 20 }), true, '20 % projde');
  assert.equal(jeLowCarb({ kcal: 400, carbs_g: 40 }), false, '40 % neprojde');
});

test('presne na prahu recept projde', () => {
  assert.equal(jeLowCarb({ kcal: 400, carbs_g: 26 }), true, '26 % je prah, ne hranice');
});

// ------------------------------------------------------- ocista tagu

test('odvozene tagy se od modelu neberou', () => {
  assert.deepEqual(ODVOZENE_TAGY, ['gluten_free', 'low_carb']);

  const odModelu = ['gluten_free', 'vegan', 'low_carb', 'high_fiber'];
  assert.deepEqual(bezOdvozenychTagu(odModelu), ['vegan', 'high_fiber']);
});

test('vegan a vegetarian zustavaji — u nich je tag i rozhodnuti o zarazeni', () => {
  // Recept bez masa neni automaticky nabidka pro vegana.
  assert.deepEqual(bezOdvozenychTagu(['vegan', 'vegetarian']), ['vegan', 'vegetarian']);
});

test('rozbity vstup nic neshodi', () => {
  assert.deepEqual(bezOdvozenychTagu(null), []);
  assert.deepEqual(bezOdvozenychTagu('gluten_free'), []);
  assert.deepEqual(bezOdvozenychTagu(['', '  ', 'vegan']), ['vegan']);
});

// ------------------------------------------------------- brana v migraci

test('brana tagy PREPOCITAVA, neoveruje je', () => {
  // Rozdil je podstatny: overeni by recept s falesnym tagem deaktivovalo.
  // Recept sam v poradku je, lze jenom tag.
  assert.match(sql, /array_remove\(v_tagy, 'gluten_free'\)/, 'gluten_free se neprepocitava');
  assert.match(sql, /array_remove\(v_tagy, 'low_carb'\)/, 'low_carb se neprepocitava');
  assert.match(
    sql,
    /NEW\.diet_tags := public\.prepocti_odvozene_tagy\(/,
    'brana ma prepocet volat, ne si ho psat sama',
  );
});

test('neznama surovina blokuje gluten_free', () => {
  // "Nevime" neni "bez lepku". recipe_diet_conflicts vraci neznamou surovinu
  // jako konflikt, takze tag nevznikne.
  assert.match(
    sql,
    /recipe_diet_conflicts\(p_ingredients, 'gluten_free'\), 1\) IS NULL/,
    'tag se ma pridat jen kdyz nejsou zadne konflikty',
  );
});

// ------------------------------------------------------------- backfill

test('prepocet ma prave jednu kopii — brana i backfill volaji tutez funkci', () => {
  // Dve kopie by se rozesly presne v okamziku, kdy na tom zalezi: backfill by
  // katalog "opravil" na jiny stav, nez jaky brana vynucuje.
  const definic = [...sql.matchAll(/create or replace function public\.prepocti_odvozene_tagy/g)];
  assert.equal(definic.length, 1, 'prepocet ma byt definovany prave jednou');

  const volani = [...sql.matchAll(/public\.prepocti_odvozene_tagy\(/g)];
  assert.ok(
    volani.length >= 4,
    `prepocet ma volat brana, UPDATE (SET i WHERE) a kontrola, nalezeno ${volani.length} volani`,
  );
});

test('migrace opravi i to, co uz v katalogu lezi', () => {
  // Brana prepocitava PRI ZAPISU. Bez backfillu by recept, do ktereho nikdo
  // nesahne, nesl tvrzeni od modelu dal — zmereno 24. 8. 2026: 21 aktivnich
  // receptu s gluten_free a skutecnym zdrojem lepku (oves, sojova omacka).
  assert.match(sql, /^update public\.recipes_catalog/m, 'migrace nema backfill');
  assert.match(
    sql,
    /set diet_tags = public\.prepocti_odvozene_tagy\(/,
    'backfill nepocita tagy touz funkci jako brana',
  );
});

test('brana se na dobu backfillu vypina a zase zapina', () => {
  // UPDATE nad katalogem neni zdarma — brana pri nem znovu vyhodnoti vsechna
  // pravidla a umi recept deaktivovat. Stejny postup jako v 20260805140000.
  assert.match(sql, /disable trigger trg_enforce_recipe_catalog_rules/);
  assert.match(sql, /enable trigger trg_enforce_recipe_catalog_rules/);

  const vypnuti = sql.indexOf('disable trigger trg_enforce_recipe_catalog_rules');
  const zapnuti = sql.indexOf('enable trigger trg_enforce_recipe_catalog_rules', vypnuti + 1);
  const update = sql.search(/^update public\.recipes_catalog/m);

  assert.ok(vypnuti < update && update < zapnuti, 'backfill nelezi mezi vypnutim a zapnutim brany');
});

test('migrace si po sobe zkontroluje to podstatne', () => {
  // Zapnuta brana, zadna deaktivace, zadny aktivni gluten_free s konfliktem.
  assert.match(sql, /zustal VYPNUTY/, 'nekontroluje se, ze brana je zpatky zapnuta');
  assert.match(sql, /Backfill deaktivoval/, 'nekontroluje se, ze backfill nikoho nedeaktivoval');
  assert.match(sql, /ma gluten_free a pritom konflikt/, 'nekontroluje se hlavni invariant');
});

test('oves je vedeny jako lepkovy', () => {
  // Botanicky lepek nema, ale bezne vlocky se melou na stejne lince jako
  // psenice. Certifikovane bezlepkove jsou samostatny vyrobek, ktery z nazvu
  // suroviny nepoznáme. Radeji zbytecne prisne.
  const vzor = sql.match(/set obsahuje_lepek = true\s+where name_cs ~\* '\(([^']+)\)'/);
  assert.ok(vzor, 'v migraci nenalezen seznam lepkovych vzoru');
  assert.ok(vzor[1].includes('oves'), 'oves ma byt mezi lepkovymi');
});

test('bezlepkove mouky maji vyjimku', () => {
  // Vzor 'mouk' by je jinak chytil taky.
  for (const vyjimka of ['kokosová mouka', 'pohanková mouka', 'kukuřičná krupice', 'prášek do pečiva']) {
    assert.ok(sql.includes(vyjimka), `chybi vyjimka pro "${vyjimka}"`);
  }
});

test('vegan a vegetarian se v brane porad OVERUJI', () => {
  // Prepocet se jich tykat nesmi.
  assert.match(sql, /'vegan' = ANY\(NEW\.diet_tags\)\s+AND array_length/);
  assert.match(sql, /'vegetarian' = ANY\(NEW\.diet_tags\)\s+AND array_length/);
  assert.doesNotMatch(sql, /array_remove\(v_tagy, 'vegan'\)/);
});
