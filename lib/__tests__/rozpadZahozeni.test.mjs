/**
 * ROZPAD ZAHOZENÝCH RECEPTŮ PODLE DŮVODU — docs/DALSI_KROK.md 8.19.
 *
 * Na produkci připadá na jeden zapsaný recept osm až devět zahozených
 * (12/93, 8/98, 12/56, změřeno 4.–6. 9. 2026), ale `zahozeno` v
 * `ai_runs.result` (purpose `recipe_generator_beh`) bylo jedno slepené
 * číslo. `rozpadZahozeniPodleDuvodu()` netvoří nový důvod zahození ani
 * nic nevaliduje — jen sečte `duvod`, který už každý zápis do `zahozeno`
 * nese (viz `provedBeh()`/`zapisRecept()` v recipeGeneratorRun.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rozpadZahozeniPodleDuvodu } from '../recipeGeneratorRun.js';

test('součet rozpadu vždy dá celkový počet zahozených', () => {
  const zahozeno = [
    { name_cs: 'A', duvod: 'jina_bilkovina' },
    { name_cs: 'B', duvod: 'surovina_mimo_seznam' },
    { name_cs: 'C', duvod: 'surovina_mimo_seznam' },
    { name_cs: 'D', duvod: 'mimo_kaloricke_pasmo' },
    { name_cs: 'E', duvod: 'shodny_nazev' },
  ];
  const rozpad = rozpadZahozeniPodleDuvodu(zahozeno);
  const soucet = Object.values(rozpad).reduce((a, b) => a + b, 0);
  assert.equal(soucet, zahozeno.length);
});

test('každý důvod se počítá zvlášť, ne slité do jednoho čísla', () => {
  const zahozeno = [
    { duvod: 'prunik_surovin' },
    { duvod: 'prunik_surovin' },
    { duvod: 'pod_cilem_bilkovin' },
  ];
  assert.deepEqual(rozpadZahozeniPodleDuvodu(zahozeno), {
    prunik_surovin: 2,
    pod_cilem_bilkovin: 1,
  });
});

test('z reálného vzorku 93 zahozených jde přečíst větu o příčinách (ilustrace tvaru, ne měření)', () => {
  const zahozeno = [
    ...Array(40).fill({ duvod: 'surovina_mimo_seznam' }),
    ...Array(20).fill({ duvod: 'mimo_kaloricke_pasmo' }),
    ...Array(15).fill({ duvod: 'pod_cilem_bilkovin' }),
    ...Array(10).fill({ duvod: 'shodny_nazev' }),
    ...Array(5).fill({ duvod: 'prunik_surovin' }),
    ...Array(3).fill({ duvod: 'nad_stropem_tuku' }),
  ];
  const rozpad = rozpadZahozeniPodleDuvodu(zahozeno);
  assert.equal(Object.values(rozpad).reduce((a, b) => a + b, 0), 93);
  assert.equal(rozpad.surovina_mimo_seznam, 40);
  assert.equal(rozpad.mimo_kaloricke_pasmo, 20);
});

test('chybějící nebo neznámý duvod se nepočítá jako 0 zahozených ani nespadne', () => {
  const zahozeno = [{ name_cs: 'X' }, { name_cs: 'Y', duvod: null }];
  const rozpad = rozpadZahozeniPodleDuvodu(zahozeno);
  assert.equal(Object.values(rozpad).reduce((a, b) => a + b, 0), 2);
  assert.equal(rozpad.neznamy_duvod, 2);
});

test('prázdné nebo chybějící pole dá prázdný rozpad, ne pád', () => {
  assert.deepEqual(rozpadZahozeniPodleDuvodu([]), {});
  assert.deepEqual(rozpadZahozeniPodleDuvodu(undefined), {});
  assert.deepEqual(rozpadZahozeniPodleDuvodu(null), {});
});
