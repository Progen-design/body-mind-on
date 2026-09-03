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
  vyloucoveSkupinyProDietu,
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

// ─────────────────────────────────────────────────────────────────────────────
// docs/DALSI_KROK.md 8.10 — systém sám objednal rybu na vegetariánský oběd,
// protože černý rybíz spadl do skupiny "ryby" jen díky shodě jménem.

test('černý rybíz není ryba — je to ovoce, ne zdroj bílkovin', () => {
  assert.notEqual(skupinaSuroviny('černý rybíz'), 'ryby');
  assert.equal(skupinaSuroviny('černý rybíz'), null);
});

test('REGRESNÍ TEST: objednávka bez diety dostane přesně tutéž skupinu jako před 8.10', () => {
  // CILOVE_BILKOVINY = ['hovezi','veprove','ryby','lusteniny','drubez'] a
  // tohle pořadí je zároveň pravidlo pro remízu (dalsiBilkovina) — nesmí se
  // posunout tím, že přibyla mapa dieta -> vyloučené skupiny.
  assert.equal(
    bilkovinaProPolozku({ meal_type: 'obed' }, [], SLOVNIK), 'hovezi',
    'prázdný katalog, žádná dieta -> vyhraje první v pořadí (hovězí)',
  );
  assert.equal(
    bilkovinaProPolozku({ meal_type: 'obed', diet_tags: [] }, [], SLOVNIK), 'hovezi',
    'prázdné diet_tags se chová jako bez diety',
  );
  assert.equal(
    bilkovinaProPolozku({ meal_type: 'obed', diet_tags: ['gluten_free'] }, [], SLOVNIK), 'hovezi',
    'neznámý tag pro vyloučení nevylučuje nic',
  );

  const kureciObedy = Array.from({ length: 7 }, () => ({
    ingredients: [{ name: 'kuřecí prsa', amount: 180 }],
  }));
  assert.equal(
    bilkovinaProPolozku({ meal_type: 'obed', diet_tags: [] }, kureciObedy, SLOVNIK), 'hovezi',
    'chybějící hovězí v katalogu + prázdné diet_tags -> stejný výsledek jako bez diet_tags vůbec',
  );
});

test('REGRESE: vegan slovník bez diet_tags rotuje jen mezi dostupným, beze změny', () => {
  const veganskySlovnik = ['čočka', 'cizrna', 'tofu', 'rýže'];
  assert.equal(
    bilkovinaProPolozku({ meal_type: 'obed' }, [], veganskySlovnik), 'lusteniny',
    'stejný výsledek jako dřív — bez diet_tags se mapa neuplatní, i když je slovník nutričně veganský',
  );
});

test('vegetariánská dieta vyloučí skupinu PŘED dostupne() — i když vzor skupiny něco chytí', () => {
  const polozka = { meal_type: 'obed', diet_tags: ['vegetarian'] };
  // Syntetický scénář z 8.10 ("dnes rybíz, zítra sójová omáčka"): tohle jméno
  // by vzor /hověz/i chytil bez ohledu na to, že je to omáčka, ne maso. Mapa
  // musí skupinu vyloučit, i když by dostupne() řekla, že je k dispozici.
  const povolene = ['hovězí rajčatová omáčka', 'čočka', 'rýže', 'tvaroh'];
  const vysledek = bilkovinaProPolozku(polozka, [], povolene);
  assert.notEqual(vysledek, 'hovezi');
  assert.notEqual(vysledek, 'drubez');
  assert.notEqual(vysledek, 'ryby');
  assert.notEqual(vysledek, 'veprove');
});

test('vegetariánská položka dostane lusteniny — mají přednost před doplňkovými skupinami', () => {
  const polozka = { meal_type: 'obed', diet_tags: ['vegetarian'] };
  const povolene = ['čočka', 'vejce', 'tvaroh'];
  assert.equal(bilkovinaProPolozku(polozka, [], povolene), 'lusteniny');
});

test('veganská položka nedostane vejce ani mlecne', () => {
  const polozka = { meal_type: 'obed', diet_tags: ['vegan'] };
  // Slovník obsahuje vejce i tvaroh, ale vegan dieta je musí vyloučit i tak.
  const povolene = ['čočka', 'vejce', 'tvaroh'];
  const vysledek = bilkovinaProPolozku(polozka, [], povolene);
  assert.notEqual(vysledek, 'vejce');
  assert.notEqual(vysledek, 'mlecne');
  assert.equal(vysledek, 'lusteniny');
});

test('vyloucoveSkupinyProDietu: gluten_free / low_carb / lactose_free nevylučují nic', () => {
  for (const tag of ['gluten_free', 'low_carb', 'lactose_free']) {
    assert.equal(vyloucoveSkupinyProDietu([tag]).size, 0, tag);
  }
  assert.equal(vyloucoveSkupinyProDietu(null).size, 0);
  assert.equal(vyloucoveSkupinyProDietu(undefined).size, 0);
});

test('vyloucoveSkupinyProDietu: vegan vylučuje víc než vegetarian', () => {
  const vegan = vyloucoveSkupinyProDietu(['vegan']);
  const vege = vyloucoveSkupinyProDietu(['vegetarian']);
  assert.ok(vegan.has('vejce'));
  assert.ok(vegan.has('mlecne'));
  assert.ok(!vege.has('vejce'), 'vegetarian smí vejce');
  assert.ok(!vege.has('mlecne'), 'vegetarian smí mléčné');
  for (const k of ['drubez', 'ryby', 'hovezi', 'veprove']) {
    assert.ok(vegan.has(k) && vege.has(k), k);
  }
});

test('explicitní protein_hint na masitou skupinu projde i u vegetariánské objednávky — je to objednávka, ne odvození', () => {
  // docs/DALSI_KROK.md 8.10 „Co nedělat": mapa dieta -> vyloučené skupiny se
  // na explicitní protein_hint NEVZTAHUJE. Tohle je záměr, ne díra.
  const polozka = { meal_type: 'obed', diet_tags: ['vegetarian'], protein_hint: 'hovezi' };
  assert.equal(
    bilkovinaProPolozku(polozka, [], SLOVNIK), 'hovezi',
    'explicitní hint vyhrává i proti dietní mapě',
  );
});
