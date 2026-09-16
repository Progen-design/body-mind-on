/**
 * lib/exerciseVariantAudit.js — PROMPT_PRO_CODE.md bod B.
 *
 * Fixture data, žádná DB. Pokrývá přesně tu hranici mezi hard fail a
 * report-only, na které jsme se s uživatelem dohodli:
 *  - hard fail: neshoda primary_muscle, strukturální integrita (rozbitý
 *    odkaz, self-reference, easier_key == harder_key, cyklus);
 *  - report-only: porušení level logiky, vzájemná (a)symetrie, fan-in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzujVarianty } from '../exerciseVariantAudit.js';

function cvik(over) {
  return {
    canonical_key: over.canonical_key,
    display_name_cs: over.display_name_cs || over.canonical_key,
    level: over.level ?? null,
    easier_key: over.easier_key ?? null,
    harder_key: over.harder_key ?? null,
    primary_muscle: over.primary_muscle ?? null,
    equipment_class: over.equipment_class ?? null,
  };
}

test('neshoda primary_muscle je hard fail, i když je pár jinak v pořádku (level i symetrie sedí)', () => {
  const rows = [
    cvik({ canonical_key: 'a', level: 'intermediate', primary_muscle: 'chest', easier_key: 'b' }),
    cvik({ canonical_key: 'b', level: 'beginner', primary_muscle: 'triceps', harder_key: 'a' }),
  ];
  const { tvrdeParyMuscle, reportOnlyPary } = analyzujVarianty(rows);
  // Vzájemný vztah a<->b je ve schématu DVĚ hrany (a.easier_key=b,
  // b.harder_key=a) — obě mají neshodu partie, obě jsou hard fail.
  assert.equal(tvrdeParyMuscle.length, 2);
  const smery = tvrdeParyMuscle.map((p) => `${p.row.canonical_key}->${p.cil.canonical_key}`).sort();
  assert.deepEqual(smery, ['a->b', 'b->a']);
  // level (intermediate -> beginner u lehčí, a naopak u těžší) i symetrie
  // (obě strany na sebe recipročně odkazují) tu sedí — páry jsou přesto
  // hard fail kvůli partii, level/symetrie je "nezachrání".
  for (const p of tvrdeParyMuscle) {
    assert.equal(p.poruseniLevelu, false);
    assert.equal(p.asymetricke, false);
  }
  assert.equal(reportOnlyPary.length, 0, 'páry s neshodou partie nepatří i do report-only seznamu');
});

test('stejná partie a jinak vadný pár (level + symetrie) je jen report-only, ne hard fail', () => {
  const rows = [
    // easier_key vede na VYŠŠÍ level (poruší level logiku) a b.harder != a (asymetrie)
    cvik({ canonical_key: 'a', level: 'beginner', primary_muscle: 'chest', easier_key: 'b' }),
    cvik({ canonical_key: 'b', level: 'expert', primary_muscle: 'chest' }),
  ];
  const { tvrdeParyMuscle, reportOnlyPary } = analyzujVarianty(rows);
  assert.equal(tvrdeParyMuscle.length, 0, 'stejná partie => není to hard fail bez ohledu na level/symetrii');
  assert.equal(reportOnlyPary.length, 1);
  assert.equal(reportOnlyPary[0].poruseniLevelu, true);
  assert.equal(reportOnlyPary[0].asymetricke, true);
});

test('chybějící level u jedné strany páru se NEPOČÍTÁ jako porušení — level nelze posoudit', () => {
  const rows = [
    cvik({ canonical_key: 'a', level: null, primary_muscle: 'chest', easier_key: 'b' }),
    cvik({ canonical_key: 'b', level: 'beginner', primary_muscle: 'chest' }),
  ];
  const { pary, levelPosouditelnych, levelPoruseni } = analyzujVarianty(rows);
  assert.equal(pary.length, 1);
  assert.equal(pary[0].poruseniLevelu, false);
  assert.equal(pary[0].levelNelzePosoudit, true);
  assert.equal(levelPosouditelnych, 0, 'pár bez levelu na jedné straně se nepočítá do posouditelných');
  assert.equal(levelPoruseni, 0);
});

test('vzájemná symetrie: A.easier=B je v pořádku, i když B žádnou harder variantu nemá (asymetrie != chyba)', () => {
  const rows = [
    cvik({ canonical_key: 'a', level: 'intermediate', primary_muscle: 'chest', easier_key: 'b' }),
    cvik({ canonical_key: 'b', level: 'beginner', primary_muscle: 'chest' /* žádný harder_key */ }),
  ];
  const { pary } = analyzujVarianty(rows);
  assert.equal(pary[0].asymetricke, true);
  // asymetrie sama o sobě je jen report-only signál, ne hard fail — ověřeno
  // testem výš (stejná partie => report-only), tady jen kontrolujeme detekci.
});

test('klíč mířící na neexistující cvik je hard fail (strukturální), nepočítá se ale do párů', () => {
  const rows = [
    cvik({ canonical_key: 'a', level: 'intermediate', primary_muscle: 'chest', easier_key: 'neexistuje' }),
  ];
  const { strukturalni, pary } = analyzujVarianty(rows);
  assert.equal(strukturalni.length, 1);
  assert.match(strukturalni[0], /neexistuje.*v registru neexistuje/);
  assert.equal(pary.length, 0, 'pár s rozbitým cílem se do analýzy párů nezapočítává (už je nahlášen jako strukturální)');
});

test('self-reference (cvik je vlastní varianta) je hard fail', () => {
  const rows = [
    cvik({ canonical_key: 'a', level: 'intermediate', primary_muscle: 'chest', easier_key: 'a' }),
  ];
  const { strukturalni } = analyzujVarianty(rows);
  assert.equal(strukturalni.length, 1);
  assert.match(strukturalni[0], /ukazuje sám na sebe/);
});

test('easier_key == harder_key u téhož cviku je hard fail', () => {
  const rows = [
    cvik({ canonical_key: 'a', primary_muscle: 'chest', easier_key: 'b', harder_key: 'b' }),
    cvik({ canonical_key: 'b', primary_muscle: 'chest' }),
  ];
  const { strukturalni } = analyzujVarianty(rows);
  assert.ok(strukturalni.some((m) => /stejný cvik/.test(m)));
});

test('cyklus (A lehčí než B, B lehčí než A) je hard fail', () => {
  const rows = [
    cvik({ canonical_key: 'a', primary_muscle: 'chest', easier_key: 'b' }),
    cvik({ canonical_key: 'b', primary_muscle: 'chest', easier_key: 'a' }),
  ];
  const { strukturalni } = analyzujVarianty(rows);
  assert.ok(strukturalni.some((m) => /^cyklus v \.easier_key:/.test(m)), strukturalni.join(' | '));
});

test('delší řetězec (ne cyklus) nehlásí nic strukturálního', () => {
  const rows = [
    cvik({ canonical_key: 'a', primary_muscle: 'chest', easier_key: 'b' }),
    cvik({ canonical_key: 'b', primary_muscle: 'chest', easier_key: 'c' }),
    cvik({ canonical_key: 'c', primary_muscle: 'chest' }),
  ];
  const { strukturalni } = analyzujVarianty(rows);
  assert.equal(strukturalni.length, 0);
});

test('fan-in: klíč použitý jako cíl >= threshold-krát se nahlásí, pod threshold ne', () => {
  const rows = [
    cvik({ canonical_key: 'cil', primary_muscle: 'chest' }),
    cvik({ canonical_key: 'z1', primary_muscle: 'chest', easier_key: 'cil' }),
    cvik({ canonical_key: 'z2', primary_muscle: 'triceps', easier_key: 'cil' }),
    cvik({ canonical_key: 'z3', primary_muscle: 'biceps', easier_key: 'cil' }),
  ];
  const bezThreshold = analyzujVarianty(rows, { fanInThreshold: 4 });
  assert.equal(bezThreshold.fanIn.length, 0, '3 zdroje neprojdou přes threshold 4');

  const sNizsimThreshold = analyzujVarianty(rows, { fanInThreshold: 3 });
  assert.equal(sNizsimThreshold.fanIn.length, 1);
  assert.equal(sNizsimThreshold.fanIn[0].zdroje.length, 3);
  assert.deepEqual(sNizsimThreshold.fanIn[0].partie.sort(), ['biceps', 'chest', 'triceps']);
  assert.equal(sNizsimThreshold.fanInNapricPartiemi.length, 1, 'tři různé partie => napříč partiemi');
});

test('fan-in napříč stejnou partií se nepočítá do fanInNapricPartiemi', () => {
  const rows = [
    cvik({ canonical_key: 'cil', primary_muscle: 'chest' }),
    cvik({ canonical_key: 'z1', primary_muscle: 'chest', easier_key: 'cil' }),
    cvik({ canonical_key: 'z2', primary_muscle: 'chest', easier_key: 'cil' }),
    cvik({ canonical_key: 'z3', primary_muscle: 'chest', easier_key: 'cil' }),
  ];
  const { fanIn, fanInNapricPartiemi } = analyzujVarianty(rows, { fanInThreshold: 3 });
  assert.equal(fanIn.length, 1);
  assert.equal(fanInNapricPartiemi.length, 0, 'jedna partie => není to podezřelý fan-in');
});

test('seřazení hard-fail seznamu: víc sešlých signálů nahoře, pak abecedně', () => {
  const rows = [
    // x<->y: neshoda partie, level i symetrie OK -> skóre 0 (dvě hrany: x->y, y->x)
    cvik({ canonical_key: 'x', level: 'intermediate', primary_muscle: 'chest', easier_key: 'y' }),
    cvik({ canonical_key: 'y', level: 'beginner', primary_muscle: 'triceps', harder_key: 'x' }),
    // w->z: neshoda partie A level porušen A asymetrie (z nemá harder zpět na w) -> skóre 2
    cvik({ canonical_key: 'w', level: 'beginner', primary_muscle: 'chest', easier_key: 'z' }),
    cvik({ canonical_key: 'z', level: 'expert', primary_muscle: 'triceps' }),
  ];
  const { tvrdeParyMuscle } = analyzujVarianty(rows);
  assert.equal(tvrdeParyMuscle.length, 3);
  assert.equal(tvrdeParyMuscle[0].row.canonical_key, 'w', 'pár se dvěma dalšími signály má být první');
  // x->y a y->x mají obě skóre 0 — tie-break abecedně podle canonical_key.
  assert.equal(tvrdeParyMuscle[1].row.canonical_key, 'x');
  assert.equal(tvrdeParyMuscle[2].row.canonical_key, 'y');
});

test('celkemParu počítá oba směry (easier i harder) u jednoho cviku zvlášť', () => {
  const rows = [
    cvik({ canonical_key: 'a', primary_muscle: 'chest', easier_key: 'b', harder_key: 'c' }),
    cvik({ canonical_key: 'b', primary_muscle: 'chest' }),
    cvik({ canonical_key: 'c', primary_muscle: 'chest' }),
  ];
  const { celkemParu } = analyzujVarianty(rows);
  assert.equal(celkemParu, 2);
});

test('prázdný registr nespadne a nehlásí nic', () => {
  const vysledek = analyzujVarianty([]);
  assert.equal(vysledek.strukturalni.length, 0);
  assert.equal(vysledek.tvrdeParyMuscle.length, 0);
  assert.equal(vysledek.celkemParu, 0);
});
