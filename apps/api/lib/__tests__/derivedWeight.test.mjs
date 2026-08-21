/**
 * ODVOZENÁ VÁHA — medián, okno, a mlčení.
 *
 * PROČ MEDIÁN. Jedno vážení v oblečení posune průměr o celý týden. Test níž
 * („jedno těžké měření nesmí strhnout výsledek") je ten rozdíl vyčíslený:
 * průměr by dal 81,5 kg, medián dá 80,1.
 *
 * PROČ NULL PO 14 DNECH. Tichý pád zpátky na registrační váhu je horší než
 * nedělat nic — cíl by skokem vyskočil na měsíce starou hodnotu a vypadalo by
 * to jako regulérní přepočet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { odvodVahu, median, OKNO_DNI, MAX_STARI_DNI } from '../derivedWeight.js';

const TED = new Date('2026-08-13T12:00:00Z');
const predDny = (d) => new Date(TED.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
const m = (dnyZpet, kg) => ({ measured_at: predDny(dnyZpet), weight_kg: kg });

test('medián: lichý, sudý, prázdný, nečíselné hodnoty', () => {
  assert.equal(median([80, 82, 81]), 81);
  assert.equal(median([80, 82]), 81);
  assert.equal(median([]), null);
  assert.equal(median(null), null);
  assert.equal(median([80, null, 'nesmysl', 82]), 81);
  assert.equal(median([80]), 80);
});

test('jedno těžké měření nesmí strhnout výsledek (proto medián, ne průměr)', () => {
  // Čtyři normální vážení a jedno v oblečení po jídle.
  const mereni = [m(1, 80.0), m(2, 80.1), m(3, 80.2), m(4, 80.3), m(5, 87.4)];
  const v = odvodVahu(mereni, TED);

  const prumer = (80.0 + 80.1 + 80.2 + 80.3 + 87.4) / 5;
  assert.equal(v.weight_kg, 80.2, 'medián drží na reálné váze');
  assert.ok(prumer > 81.5, `průměr by byl ${prumer.toFixed(2)} — o víc než kilo vedle`);
  assert.equal(v.pocet_mereni, 5);
  assert.equal(v.okno, '7d');
  assert.equal(v.duvod, 'ok');
});

test('počítá se jen ze 7denního okna, starší měření se do mediánu nepletou', () => {
  const v = odvodVahu([m(1, 80), m(2, 80), m(9, 95), m(12, 96)], TED);
  assert.equal(v.weight_kg, 80);
  assert.equal(v.pocet_mereni, 2, 'měření z 9. a 12. dne do 7denního okna nepatří');
  assert.equal(v.okno, '7d');
});

test('nic za týden, ale něco do 14 dnů → širší okno, volající to pozná', () => {
  const v = odvodVahu([m(9, 84), m(12, 86)], TED);
  assert.equal(v.weight_kg, 85);
  assert.equal(v.okno, '14d', 'nouzový režim musí být rozpoznatelný');
  assert.equal(v.pocet_mereni, 2);
  assert.equal(v.duvod, 'ok');
});

test('nic za 14 dní → null a cíl se nemění', () => {
  const v = odvodVahu([m(15, 84), m(40, 90)], TED);
  assert.equal(v.weight_kg, null, 'null, ne registrační váha');
  assert.equal(v.duvod, 'starsi_nez_14_dni');
  assert.equal(v.okno, null);
  assert.equal(v.pocet_mereni, 0);
  // Stáří se vrací i tak — volající má vědět, jak moc jsou data stará.
  assert.ok(v.nejnovejsi_at, 'stáří nejnovějšího měření se hlásí i při null');
  assert.ok(v.stari_hodin > 14 * 24);
});

test('žádná měření vůbec', () => {
  const v = odvodVahu([], TED);
  assert.equal(v.weight_kg, null);
  assert.equal(v.duvod, 'zadna_mereni');
  assert.equal(v.nejnovejsi_at, null);
  assert.equal(v.stari_hodin, null);
});

test('hlásí stáří nejnovějšího měření, aby volající poznal stará data', () => {
  const v = odvodVahu([m(3, 80), m(1, 81)], TED);
  assert.equal(v.stari_hodin, 24, 'nejnovější je den staré');
  assert.equal(v.nejnovejsi_at, predDny(1));
});

test('měření z budoucnosti se ignoruje (rozbitá časová zóna zdroje)', () => {
  const budoucnost = new Date(TED.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const v = odvodVahu([{ measured_at: budoucnost, weight_kg: 60 }, m(2, 80)], TED);

  assert.equal(v.weight_kg, 80, 'budoucí měření nesmí do mediánu');
  assert.equal(v.pocet_mereni, 1);
  assert.equal(v.stari_hodin, 48, 'ani nesmí předstírat, že jsou data čerstvá');
});

test('měření bez váhy (jen obvod pasu) se nepočítá', () => {
  const v = odvodVahu([
    { measured_at: predDny(1), weight_kg: null },
    { measured_at: predDny(2), weight_kg: 79 },
  ], TED);
  assert.equal(v.weight_kg, 79);
  assert.equal(v.pocet_mereni, 1);
});

test('hranice oken jsou přesně tam, kde mají být', () => {
  assert.equal(OKNO_DNI, 7);
  assert.equal(MAX_STARI_DNI, 14);

  // Přesně na hraně 7 dnů → ještě v hlavním okně.
  assert.equal(odvodVahu([m(OKNO_DNI, 77)], TED).okno, '7d');
  // Těsně za ní → širší okno.
  assert.equal(odvodVahu([m(OKNO_DNI + 0.5, 77)], TED).okno, '14d');
  // Přesně na hraně 14 dnů → ještě se počítá.
  assert.equal(odvodVahu([m(MAX_STARI_DNI, 77)], TED).duvod, 'ok');
  // Těsně za ní → null.
  assert.equal(odvodVahu([m(MAX_STARI_DNI + 0.1, 77)], TED).weight_kg, null);
});
