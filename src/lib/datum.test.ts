// Osa grafů ukazovala „09.01" — americké měsíc-den. Test hlídá pořadí,
// ne jen to, že se něco vypíše.
import test from 'node:test';
import assert from 'node:assert/strict';
import { kratkeDatumCS } from './datum.ts';

test('den je první, měsíc druhý', () => {
  assert.equal(kratkeDatumCS('2026-09-01'), '1. 9.');
  assert.equal(kratkeDatumCS('2026-01-09'), '9. 1.');
  // Přesně ta dvojice, kterou nešlo od sebe rozeznat, když se pořadí prohodilo.
  assert.notEqual(kratkeDatumCS('2026-09-01'), kratkeDatumCS('2026-01-09'));
});

test('nikdy nevrátí americký tvar MM.DD', () => {
  for (const iso of ['2026-09-07', '2026-12-31', '2026-02-03']) {
    assert.doesNotMatch(kratkeDatumCS(iso), /^0\d\./, `${iso} vypadá jako měsíc na začátku`);
  }
  assert.equal(kratkeDatumCS('2026-09-07'), '7. 9.');
});

test('bere i delší ISO řetězec s časem', () => {
  assert.equal(kratkeDatumCS('2026-08-22T18:23:00Z'), '22. 8.');
});

test('nula na začátku se nevypisuje', () => {
  assert.equal(kratkeDatumCS('2026-03-05'), '5. 3.');
});

test('nesmysl vrací prázdno, ne "NaN. NaN."', () => {
  for (const vstup of ['', null, undefined, 'nesmysl', '2026-13-01', '2026-09-32', '09.2026']) {
    assert.equal(kratkeDatumCS(vstup as string), '', `vstup ${String(vstup)}`);
  }
});

test('neparsuje přes new Date — 1. den měsíce se neposune o den zpátky', () => {
  // `new Date('2026-09-01')` je půlnoc UTC; v zóně UTC-2 by z toho
  // vypadlo „31. 8.". Funkce řetězec jen dělí, takže na zóně nezáleží.
  assert.equal(kratkeDatumCS('2026-09-01'), '1. 9.');
  assert.equal(kratkeDatumCS('2026-01-01'), '1. 1.');
});
