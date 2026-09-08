/**
 * lib/dietaryExclusions.js — alergeny zadané volným textem.
 *
 * Nález 8. 9. 2026 při průchodu registrací: účet s „Alergie na ořechy“
 * v poli ZDRAVOTNÍ OMEZENÍ dostal plán s arašídovým máslem v pěti jídlech,
 * mandlovým mlékem ve čtyřech a mandlemi v jednom. Text se ukládal i
 * propisoval do kontextu plánu správně — ale jako výraz k hledání byl
 * bezcenný, protože se hledala surovina jménem „alergie na orechy“.
 * Zároveň „houby“ z pole CO NEJÍŠ neblokovaly „žampiony“.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDietaryExclusions, textContainsExcludedFood } from '../dietaryExclusions.js';

const ALERGIE_NA_ORECHY = parseDietaryExclusions({ dietary_restrictions: 'Alergie na ořechy' });

test('věta „Alergie na ořechy“ se očistí na samotnou potravinu', () => {
  assert.deepEqual(ALERGIE_NA_ORECHY.rawTerms, ['orechy']);
  assert.equal(ALERGIE_NA_ORECHY.nutsExcluded, true);
});

test('ořechová alergie blokuje celou skupinu, ne jen slovo „ořech“', () => {
  for (const surovina of [
    '35 g arašídové máslo',
    '215 ml mandlové mléko',
    '20 g mandle',
    '200 g lískové oříšky',
    '30 g kešu',
    '15 g pistácie',
    '40 g vlašské ořechy',
    '20 g pekanové ořechy',
  ]) {
    assert.equal(textContainsExcludedFood(surovina, ALERGIE_NA_ORECHY), true, `mělo být blokováno: ${surovina}`);
  }
});

test('rostlinná maska nesmí ořechy propustit — mandlové mléko je pro alergika zakázané', () => {
  // Maska existuje kvůli bezlaktózové dietě, kde je mandlové mléko v pořádku.
  const bezLaktozyIAlergie = parseDietaryExclusions({
    diet_type: 'lactose_free',
    dietary_restrictions: 'Alergie na ořechy',
  });
  assert.equal(textContainsExcludedFood('215 ml mandlové mléko', bezLaktozyIAlergie), true);
  assert.equal(textContainsExcludedFood('35 g arašídové máslo', bezLaktozyIAlergie), true);
  // Kokosové mléko ořech není a bezlaktózovému účtu má zůstat.
  assert.equal(textContainsExcludedFood('200 ml kokosové mléko', bezLaktozyIAlergie), false);
});

test('„houby“ blokují i konkrétní druhy', () => {
  const bezHub = parseDietaryExclusions({ foods_to_avoid: 'houby' });
  assert.equal(bezHub.mushroomsExcluded, true);
  for (const surovina of ['100 g žampiony', '200 g hlíva ústřičná', '50 g sušené hřiby', '30 g shiitake']) {
    assert.equal(textContainsExcludedFood(surovina, bezHub), true, `mělo být blokováno: ${surovina}`);
  }
});

test('bez uvedeného omezení se neblokuje nic navíc', () => {
  const zadne = parseDietaryExclusions({});
  assert.equal(zadne.nutsExcluded, false);
  assert.equal(zadne.mushroomsExcluded, false);
  for (const surovina of ['35 g arašídové máslo', '100 g žampiony', '50 g tvaroh']) {
    assert.equal(textContainsExcludedFood(surovina, zadne), false, `nemělo být blokováno: ${surovina}`);
  }
});

test('vlašský salát není ořech — kmen „vlassk“ se schválně nepoužívá', () => {
  assert.equal(textContainsExcludedFood('200 g vlašský salát', ALERGIE_NA_ORECHY), false);
});

test('běžné suroviny projdou i s alergií', () => {
  for (const surovina of ['200 g kuřecí prsa', '100 g rýže', '160 g cizrna', '150 g brambory', '2 ks mandarinka']) {
    assert.equal(textContainsExcludedFood(surovina, ALERGIE_NA_ORECHY), false, `nemělo být blokováno: ${surovina}`);
  }
});

test('další uvozovací fráze se očistí stejně', () => {
  for (const [veta, ocekavano] of [
    ['Nesnáším houby', 'houby'],
    ['Intolerance na laktózu', 'laktozu'],
    ['bez lepku', 'lepku'],
    ['Vynechat ryby', 'ryby'],
    ['Alergická na arašídy', 'arasidy'],
  ]) {
    assert.deepEqual(parseDietaryExclusions({ foods_to_avoid: veta }).rawTerms, [ocekavano], veta);
  }
});
