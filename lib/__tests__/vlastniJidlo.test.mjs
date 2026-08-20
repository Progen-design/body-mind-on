/**
 * Vlastní jídlo a vlastní položka nákupu.
 *
 * Nejdůležitější pravidlo, které tyhle testy hlídají: jídlo bez ověřené nutrice
 * NESMÍ vstoupit do denního součtu jako plnohodnotné. Započítá se teprve, když
 * uživatel kalorie sám vyplní.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DELKA_NAZVU,
  overPolozkuNakupu,
  overVlastniJidlo,
  popisNezapocteneho,
  souctyDne,
  zapocitatDoSouctu,
} from '../profile/vlastniJidlo.js';

test('bez zadaných kalorií se vlastní jídlo do součtu nepočítá', () => {
  assert.equal(zapocitatDoSouctu({ title: 'Řízek u babičky' }), false);
  assert.equal(zapocitatDoSouctu({ kcal_rucne: null }), false);
  assert.equal(zapocitatDoSouctu({ kcal_rucne: '' }), false);
  assert.equal(zapocitatDoSouctu(null), false);
});

test('s kaloriemi se započítá', () => {
  assert.equal(zapocitatDoSouctu({ kcal_rucne: 650 }), true);
  assert.equal(zapocitatDoSouctu({ kcal_rucne: '650' }), true);
});

test('nula kalorií je platný údaj, ne „nevyplněno“', () => {
  // Čaj bez cukru má opravdu nula kalorií. `Number(null)` je taky nula —
  // kdyby se to slilo, nevyplněné jídlo by tiše přidávalo 0 a tvářilo se
  // jako započítané.
  assert.equal(zapocitatDoSouctu({ kcal_rucne: 0 }), true);
  assert.equal(zapocitatDoSouctu({ kcal_rucne: null }), false);
});

test('součet dne: nezapočítaná jídla se spočítají zvlášť', () => {
  const s = souctyDne({
    planovane: { kcal: 1800, protein: 120, carbs: 200, fat: 60 },
    vlastni: [
      { kcal_rucne: 300, protein_g: 20 },
      { title: 'Něco u kamaráda' },
      { title: 'Ještě něco' },
    ],
  });
  assert.equal(s.kcal, 2100);
  assert.equal(s.protein, 140);
  assert.equal(s.carbs, 200);
  assert.equal(s.fat, 60);
  assert.equal(s.zapocteno, 1);
  assert.equal(s.nezapocteno, 2);
});

test('bez naplánovaných jídel zůstává součet null, ne nula', () => {
  const s = souctyDne({});
  assert.equal(s.kcal, null);
  assert.equal(s.protein, null);
});

test('vlastní jídlo s kaloriemi vytvoří součet i tam, kde plán nic nemá', () => {
  const s = souctyDne({ planovane: {}, vlastni: [{ kcal_rucne: 420 }] });
  assert.equal(s.kcal, 420);
  // Makra ale nevyplnil, takže zůstávají null — ne nula.
  assert.equal(s.protein, null);
});

test('chybějící makro u započítaného jídla nesnižuje součet na nulu', () => {
  const s = souctyDne({
    planovane: { kcal: 1000, protein: 50 },
    vlastni: [{ kcal_rucne: 200 }],
  });
  assert.equal(s.kcal, 1200);
  assert.equal(s.protein, 50);
});

test('věta o nezapočítaných jídlech se skloňuje a u nuly mlčí', () => {
  assert.equal(popisNezapocteneho(0), null);
  assert.equal(popisNezapocteneho(null), null);
  assert.match(popisNezapocteneho(1), /^1 vlastní jídlo bez zadaných kalorií se nepočítá/);
  assert.match(popisNezapocteneho(3), /^3 vlastní jídla bez zadaných kalorií se nepočítají/);
  assert.match(popisNezapocteneho(7), /^7 vlastních jídel bez zadaných kalorií se nepočítají/);
});

test('formulář: název a den jsou povinné', () => {
  assert.equal(overVlastniJidlo({ local_date: '2026-08-21' }).ok, false);
  assert.equal(overVlastniJidlo({ title: '   ', local_date: '2026-08-21' }).ok, false);
  assert.equal(overVlastniJidlo({ title: 'Řízek' }).ok, false);
  assert.equal(overVlastniJidlo({ title: 'Řízek', local_date: '21.8.2026' }).ok, false);
});

test('formulář: prázdné kalorie zůstanou null, ne nula', () => {
  const r = overVlastniJidlo({ title: 'Řízek', local_date: '2026-08-21' });
  assert.equal(r.ok, true);
  assert.equal(r.hodnota.kcal_rucne, null);
  assert.equal(r.hodnota.protein_g, null);
});

test('formulář: zadaná nula se zachová jako nula', () => {
  const r = overVlastniJidlo({ title: 'Čaj', local_date: '2026-08-21', kcal_rucne: 0 });
  assert.equal(r.ok, true);
  assert.equal(r.hodnota.kcal_rucne, 0);
});

test('formulář odmítne nesmysly', () => {
  assert.equal(overVlastniJidlo({ title: 'X', local_date: '2026-08-21', kcal_rucne: -5 }).ok, false);
  assert.equal(overVlastniJidlo({ title: 'X', local_date: '2026-08-21', kcal_rucne: 99999 }).ok, false);
  assert.equal(overVlastniJidlo({ title: 'a'.repeat(MAX_DELKA_NAZVU + 1), local_date: '2026-08-21' }).ok, false);
});

test('formulář ořízne bílé znaky v názvu', () => {
  const r = overVlastniJidlo({ title: '  Řízek s bramborem  ', local_date: '2026-08-21' });
  assert.equal(r.hodnota.title, 'Řízek s bramborem');
});

test('položka nákupu: prostý text, bez parsování', () => {
  const r = overPolozkuNakupu('  toaleťák 2 balení  ');
  assert.equal(r.ok, true);
  assert.equal(r.hodnota, 'toaleťák 2 balení');
  assert.equal(overPolozkuNakupu('').ok, false);
  assert.equal(overPolozkuNakupu('   ').ok, false);
  assert.equal(overPolozkuNakupu('x'.repeat(201)).ok, false);
});
