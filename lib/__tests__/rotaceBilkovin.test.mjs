/**
 * Rotace hlavní bílkoviny — aby generátor přestal vracet pořád kuře.
 *
 * Změřeno v produkci (recipes_catalog, active, kcal 400–650): hovězí 4 obědy
 * a 0 večeří, vepřové 2 a 1, zatímco drůbež 22 a 29. Ryby a luštěniny byly
 * v pořádku, takže nešlo o plošnou monokulturu, ale o dvě chybějící suroviny.
 *
 * Testy tlačí hlavně na to, co odlišuje funkční rotaci od přání v promptu:
 * rozpoznat hlavní bílkovinu správně (ne podle prvního výskytu) a poznat,
 * když model hint nesplnil.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bilkovinaProPolozku,
  dalsiBilkovina,
  hlavniBilkovinaReceptu,
  popisSkupiny,
  receptSplnujeBilkovinu,
  rozlozeniBilkovin,
  skupinaSuroviny,
  surovinySkupiny,
} from '../plan/rotaceBilkovin.js';

// Skutečné názvy z ingredients_nutrition (18. 8. 2026).
const SLOVNIK = [
  'hovězí maso', 'libové hovězí maso', 'nakládané hovězí', 'hovězí hash', 'hovězí vývar',
  'mleté vepřové', 'vepřová panenka', 'vepřová plec', 'libové maso (např. vepřové)',
  'slanina', 'šunka', 'klobása', 'krůtí klobása',
  'kuřecí prsa', 'grilovaná kuřecí prsa', 'krůtí prsa', 'kuřecí vývar',
  'losos', 'tuňák', 'čočka', 'cizrna', 'tofu', 'vejce', 'tvaroh', 'rýže', 'brambory',
];

test('suroviny se zařadí do správné skupiny', () => {
  assert.equal(skupinaSuroviny('hovězí maso'), 'hovezi');
  assert.equal(skupinaSuroviny('libové hovězí maso'), 'hovezi');
  assert.equal(skupinaSuroviny('mleté vepřové'), 'veprove');
  assert.equal(skupinaSuroviny('vepřová panenka'), 'veprove');
  assert.equal(skupinaSuroviny('libové maso (např. vepřové)'), 'veprove');
  assert.equal(skupinaSuroviny('kuřecí prsa'), 'drubez');
  assert.equal(skupinaSuroviny('losos'), 'ryby');
  assert.equal(skupinaSuroviny('čočka'), 'lusteniny');
  assert.equal(skupinaSuroviny('rýže'), null, 'příloha není bílkovina');
  assert.equal(skupinaSuroviny(''), null);
});

test('krůtí klobása je drůbež, ne uzenina — na pořadí vzorů záleží', () => {
  assert.equal(skupinaSuroviny('krůtí klobása'), 'drubez');
  assert.equal(skupinaSuroviny('klobása'), 'veprove');
});

test('vývar se nepočítá — je to ochucovadlo, ne porce', () => {
  assert.equal(skupinaSuroviny('hovězí vývar'), null);
  assert.equal(skupinaSuroviny('kuřecí vývar'), null);
});

test('hlavní bílkovina se určí podle gramáže, ne podle pořadí', () => {
  // Hovězí s trochou sýra navrch je hovězí jídlo.
  const recept = {
    ingredients: [
      { name: 'tvaroh', amount: 15 },
      { name: 'hovězí maso', amount: 180 },
      { name: 'brambory', amount: 250 },
    ],
  };
  assert.equal(hlavniBilkovinaReceptu(recept), 'hovezi');
});

test('recept bez bílkoviny se do rotace nepočítá', () => {
  assert.equal(hlavniBilkovinaReceptu({ ingredients: [{ name: 'rýže', amount: 200 }] }), null);
  assert.equal(hlavniBilkovinaReceptu(null), null);
  assert.equal(hlavniBilkovinaReceptu({}), null);
});

test('hint je splněný jen při porcové gramáži', () => {
  const kureSeSlaninou = {
    ingredients: [{ name: 'kuřecí prsa', amount: 200 }, { name: 'slanina', amount: 10 }],
  };
  assert.equal(receptSplnujeBilkovinu(kureSeSlaninou, 'veprove'), false,
    '10 g slaniny z kuřete vepřové nedělá');
  assert.equal(receptSplnujeBilkovinu(kureSeSlaninou, 'drubez'), true);

  const veprova = { ingredients: [{ name: 'vepřová panenka', amount: 150 }] };
  assert.equal(receptSplnujeBilkovinu(veprova, 'veprove'), true);
});

test('bez hintu se nedá nic porušit', () => {
  const r = { ingredients: [{ name: 'kuřecí prsa', amount: 200 }] };
  for (const bez of [null, undefined, '']) assert.equal(receptSplnujeBilkovinu(r, bez), true);
});

test('název receptu se neověřuje — ten může slibovat cokoliv', () => {
  const lzivy = { name_cs: 'Hovězí guláš', ingredients: [{ name: 'kuřecí prsa', amount: 200 }] };
  assert.equal(receptSplnujeBilkovinu(lzivy, 'hovezi'), false,
    'kontrola musí jít po surovinách, ne po názvu');
});

test('adresář surovin dá modelu přesné názvy ze slovníku', () => {
  const hovezi = surovinySkupiny(SLOVNIK, 'hovezi');
  assert.ok(hovezi.includes('hovězí maso'));
  assert.ok(hovezi.includes('libové hovězí maso'));
  assert.ok(!hovezi.includes('hovězí vývar'), 'vývar do adresáře nepatří');
  assert.ok(!hovezi.includes('kuřecí prsa'));

  const veprove = surovinySkupiny(SLOVNIK, 'veprove');
  assert.ok(veprove.includes('vepřová panenka'));
  assert.ok(veprove.includes('mleté vepřové'));
  assert.ok(!veprove.includes('krůtí klobása'), 'krůtí klobása je drůbež');

  assert.deepEqual(surovinySkupiny(SLOVNIK, null), [], 'bez skupiny prázdný adresář');
});

test('rotace vybere nejméně zastoupenou bílkovinu', () => {
  // Reálné rozložení večeří: drůbež 29, ryby 11, luštěniny 15, hovězí 0, vepřové 1.
  const pocty = new Map([['drubez', 29], ['ryby', 11], ['lusteniny', 15], ['veprove', 1]]);
  assert.equal(dalsiBilkovina(pocty, ['hovezi', 'veprove', 'ryby', 'drubez']), 'hovezi',
    'hovězí chybí úplně, musí jít první');
});

test('při shodě rozhoduje pořadí, ne náhoda — jinak se výsledek nedá změřit', () => {
  const pocty = new Map();
  assert.equal(dalsiBilkovina(pocty, ['veprove', 'hovezi']), 'veprove');
  assert.equal(dalsiBilkovina(pocty, ['veprove', 'hovezi']), 'veprove', 'stejný vstup, stejný výstup');
  assert.equal(dalsiBilkovina(pocty, ['hovezi', 'veprove']), 'hovezi');
});

test('rotace bez cílových skupin nevrací nesmysl', () => {
  assert.equal(dalsiBilkovina(new Map(), []), null);
  assert.equal(dalsiBilkovina(new Map(), null), null);
});

test('rozložení spočítá recepty podle hlavní bílkoviny', () => {
  const pocty = rozlozeniBilkovin([
    { ingredients: [{ name: 'kuřecí prsa', amount: 200 }] },
    { ingredients: [{ name: 'kuřecí prsa', amount: 180 }] },
    { ingredients: [{ name: 'hovězí maso', amount: 150 }] },
    { ingredients: [{ name: 'rýže', amount: 200 }] },
  ]);
  assert.equal(pocty.get('drubez'), 2);
  assert.equal(pocty.get('hovezi'), 1);
  assert.equal(pocty.has('lusteniny'), false);
});

test('popis skupiny je česky, pro prompt', () => {
  assert.equal(popisSkupiny('hovezi'), 'hovězí maso');
  assert.equal(popisSkupiny('veprove'), 'vepřové maso');
});

// ─────────────────────────────────────────────────────────────────────────────
// Odvození hintu pro konkrétní položku fronty.

test('explicitní protein_hint z fronty vyhrává — je to objednávka', () => {
  const existujici = [{ ingredients: [{ name: 'hovězí maso', amount: 200 }] }];
  assert.equal(
    bilkovinaProPolozku({ protein_hint: 'veprove', meal_type: 'obed' }, existujici, SLOVNIK),
    'veprove',
    'rotace nesmí přebít ruční zadání',
  );
});

test('bez hintu se odvodí z toho, co v katalogu chybí', () => {
  // Sedm kuřecích obědů a nic jiného → další objednávka nesmí být zase kuře.
  const existujici = Array.from({ length: 7 }, () => ({
    ingredients: [{ name: 'kuřecí prsa', amount: 180 }],
  }));
  const vybrano = bilkovinaProPolozku({ meal_type: 'obed' }, existujici, SLOVNIK);
  assert.notEqual(vybrano, 'drubez');
  assert.equal(vybrano, 'hovezi', 'hovězí chybí úplně a je první v pořadí');
});

test('hint, na který ve slovníku nic není, se zahodí', () => {
  // Vegan položka: hovězí v povolených surovinách není, takže by hint jen
  // zaručil, že se celá dávka zahodí na kontrole.
  const veganskySlovnik = ['čočka', 'cizrna', 'tofu', 'rýže'];
  assert.equal(
    bilkovinaProPolozku({ protein_hint: 'hovezi', meal_type: 'obed' }, [], veganskySlovnik),
    null,
  );
  assert.equal(
    bilkovinaProPolozku({ meal_type: 'obed' }, [], veganskySlovnik),
    'lusteniny',
    'rotuje se jen mezi tím, co je opravdu k dispozici',
  );
});

test('snídaně a svačina se nerotují — nutily by nesmysly', () => {
  for (const slot of ['snidane', 'svacina']) {
    assert.equal(bilkovinaProPolozku({ meal_type: slot }, [], SLOVNIK), null, slot);
  }
  // Ruční objednávku ale respektují.
  assert.equal(bilkovinaProPolozku({ meal_type: 'svacina', protein_hint: 'vejce' }, [], SLOVNIK), 'vejce');
});
