/**
 * Priorita objednavky podle velikosti diry v bilkovinach.
 *
 * PROC. Do 23. 8. 2026 mely vsechny objednavky jednoho stupne totez cislo
 * a fronta je radila jen podle stari. Nejhorsi dira tak cekala za deseti
 * mirnejsimi. Fronta ma 106 cekajicich polozek, nejstarsi z 9. 8.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { PRIORITA, prioritaPodleMinuti } from '../recipeGenerationQueue.js';

test('bez minuti se priorita nemeni', () => {
  assert.equal(prioritaPodleMinuti(40, null), 40);
  assert.equal(prioritaPodleMinuti(40, 0), 40);
  assert.equal(prioritaPodleMinuti(40, -0.1), 40);
  assert.equal(prioritaPodleMinuti(40, Number.NaN), 40);
});

test('vetsi dira jde ve fronte driv', () => {
  const male = prioritaPodleMinuti(40, 0.11);
  const velke = prioritaPodleMinuti(40, 0.28);

  assert.ok(velke < male, `${velke} musi byt pred ${male}`);
  assert.ok(male < 40, 'jakekoli minuti ma posunout nahoru');
});

test('posun je stropovany, mirnejsi stupen nikdy nepredbehne tvrdou diru', () => {
  // SLOT_NEVYRESEN = 10 je plan, ktery se nedorucil. Slot, ktery se vyresil
  // spatne, je mensi problem a nesmi se pred nej dostat ani pri extremnim minuti.
  const nejhorsi = prioritaPodleMinuti(PRIORITA.SLOT_MINUL_BILKOVINY, 1);

  assert.ok(nejhorsi > PRIORITA.SLOT_NEVYRESEN, `${nejhorsi} nesmi predbehnout ${PRIORITA.SLOT_NEVYRESEN}`);
  assert.equal(nejhorsi, PRIORITA.SLOT_MINUL_BILKOVINY - 9);
});

test('stupne zustavaji oddelene i pri plnem posunu', () => {
  // Kdyby se prekryly, prestala by mit stupnice smysl.
  const minulBilkoviny = prioritaPodleMinuti(PRIORITA.SLOT_MINUL_BILKOVINY, 1);
  const maloKandidatu = prioritaPodleMinuti(PRIORITA.MALO_KANDIDATU, 1);

  assert.ok(minulBilkoviny < PRIORITA.MALO_KANDIDATU);
  assert.ok(maloKandidatu > PRIORITA.SLOT_MINUL_BILKOVINY);
});

test('poradi odpovida velikosti diry napric celym rozsahem', () => {
  const minuti = [0.05, 0.10, 0.15, 0.20, 0.30, 0.50];
  const priority = minuti.map((m) => prioritaPodleMinuti(40, m));

  for (let i = 1; i < priority.length; i += 1) {
    assert.ok(priority[i] <= priority[i - 1], `minuti ${minuti[i]} nesmi byt az za ${minuti[i - 1]}`);
  }
});
