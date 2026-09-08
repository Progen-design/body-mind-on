/**
 * Laťka kvality postupu — recepty musí mít skutečný postup, ne vatu.
 * Každé pravidlo z lib/plan/kvalitaPostupu.js má tu vlastní test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { posudPostup, slovoJeVTextu, slovaTextu, MIN_KROKU, MIN_DELKA_POSTUPU } from '../plan/kvalitaPostupu.js';

/** Dobrý postup, který má projít vším — základ pro testy jednotlivých pravidel. */
const DOBRY_POSTUP = {
  nazev: 'Kuře s bramborem',
  suroviny: ['kuřecí prsa', 'brambory', 'sůl'],
  kroky: [
    'Oloupej brambory a nakrájej je na kostky přibližně 2 cm.',
    'Vlož brambory do hrnce se studenou osolenou vodou a vař 15 minut, dokud nezměknou.',
    'Osol kuřecí prsa a opeč je na pánvi na oleji 6 minut z každé strany při teplotě 180 °C.',
    'Sceď brambory, kuřecí prsa nakrájej na plátky a podávej společně na talíři.',
  ],
};

test('dobrý postup projde beze zbytku', () => {
  const v = posudPostup(DOBRY_POSTUP);
  assert.deepEqual(v.duvody, []);
  assert.equal(v.ok, true);
});

test('pravidlo: min. počet kroků', () => {
  const v = posudPostup({ ...DOBRY_POSTUP, kroky: DOBRY_POSTUP.kroky.slice(0, 2) });
  assert.equal(v.ok, false);
  assert.ok(v.duvody.some((d) => d.includes(`míň než ${MIN_KROKU} kroky`)));
});

test('pravidlo: min. délka celého postupu', () => {
  const v = posudPostup({
    nazev: 'Test',
    suroviny: ['kuřecí prsa'],
    kroky: ['Osol maso.', 'Opeč maso.', 'Podávej maso.', 'Ozdob maso.'],
  });
  assert.equal(v.ok, false);
  assert.ok(v.duvody.some((d) => d.includes(`min. je ${MIN_DELKA_POSTUPU}`)));
});

test('pravidlo: každý krok začíná rozkazovacím slovesem', () => {
  const v = posudPostup({
    ...DOBRY_POSTUP,
    kroky: [
      DOBRY_POSTUP.kroky[0],
      'Toto je popisná věta bez rozkazu, co se s bramborami stane.',
      DOBRY_POSTUP.kroky[2],
      DOBRY_POSTUP.kroky[3],
    ],
  });
  assert.equal(v.ok, false);
  assert.ok(v.duvody.some((d) => d.includes('krok 2 nezačíná rozkazovacím slovesem')));
});

test('pravidlo: krok není jen „Připrav X"/"Nachystej X" bez dalšího obsahu', () => {
  const v = posudPostup({
    nazev: 'Kuře s bramborem',
    suroviny: ['brambory', 'kuřecí prsa'],
    kroky: [
      'Připrav brambory (syrové).',
      'Upeč nebo opeč kuřecí prsa na oleji.',
      'Doplň zeleninou a podávej jako jednu porci.',
      'Ozdob bylinkami a servíruj.',
    ],
  });
  assert.equal(v.ok, false);
  assert.ok(v.duvody.some((d) => d.includes('krok 1 je prázdná vata') && d.includes('Připrav brambory')));

  // Stejné sloveso, ale s dalším obsahem (množství + druhý úkon) prázdné není.
  const vDobry = posudPostup({
    nazev: 'Test',
    suroviny: ['brambory'],
    kroky: ['Připrav 400 g brambor, oloupej je a nakrájej na kostky.'],
  });
  assert.ok(!vDobry.duvody.some((d) => d.includes('prázdná vata')));
});

test('pravidlo: každá hlavní surovina se objeví aspoň v jednom kroku', () => {
  const v = posudPostup({
    nazev: 'Kuře s rýží',
    suroviny: ['kuřecí prsa', 'rýže', 'sůl'],
    kroky: [
      'Kuřecí prsa osol a opeč na pánvi 6 minut při 180 °C.',
      'Podávej na talíři s oblohou.',
      'Ozdob bylinkami a servíruj ihned.',
      'Nech chvíli odpočinout a poté servíruj.',
    ],
  });
  assert.equal(v.ok, false);
  assert.ok(v.duvody.some((d) => d.includes('nezmiňuje surovinu') && d.includes('rýže')));

  // Koření a základ (sůl, olej, voda...) se vynechávat smí.
  assert.ok(!v.duvody.some((d) => d.includes('sůl')));
});

test('pravidlo: u tepelné úpravy musí padnout teplota nebo čas', () => {
  const v = posudPostup({
    nazev: 'Kuře na pánvi',
    suroviny: ['kuřecí prsa'],
    kroky: [
      'Kuřecí prsa osol a opepři ze všech stran.',
      'Opeč kuřecí prsa na pánvi na oleji dozlatova.',
      'Nech chvíli odpočinout na talíři.',
      'Podávej ihned s oblohou podle chuti.',
    ],
  });
  assert.equal(v.ok, false);
  assert.ok(v.duvody.some((d) => d.includes('tepelná úprava bez teploty i bez času')));

  const vSCasem = posudPostup({
    nazev: 'Kuře na pánvi',
    suroviny: ['kuřecí prsa'],
    kroky: [
      'Kuřecí prsa osol a opepři ze všech stran.',
      'Opeč kuřecí prsa na pánvi na oleji 8 minut z každé strany.',
      'Nech chvíli odpočinout na talíři.',
      'Podávej ihned s oblohou podle chuti.',
    ],
  });
  assert.ok(!vSCasem.duvody.some((d) => d.includes('tepelná úprava')));
});

test('pravidlo: postup nesmí uvádět kcal ani makra', () => {
  const vKcal = posudPostup({
    ...DOBRY_POSTUP,
    kroky: [...DOBRY_POSTUP.kroky.slice(0, 3), 'Porce má přibližně 450 kcal, podávej ihned.'],
  });
  assert.equal(vKcal.ok, false);
  assert.ok(vKcal.duvody.some((d) => d.includes('kalorickou hodnotu')));

  const vMakra = posudPostup({
    ...DOBRY_POSTUP,
    kroky: [...DOBRY_POSTUP.kroky.slice(0, 3), 'Podávej ihned, porce má 30 g bílkovin.'],
  });
  assert.equal(vMakra.ok, false);
  assert.ok(vMakra.duvody.some((d) => d.includes('makroživiny v textu')));

  // "tuk" jako surovina (např. na pánvi) legitimní zmínka je, nejde o makro-výčet.
  const vTuk = posudPostup({
    nazev: 'Test',
    suroviny: ['kuřecí prsa', 'tuk na smažení'],
    kroky: [
      'Rozehřej 50 g tuku na pánvi na středním plameni.',
      'Kuřecí prsa osol a vlož na rozehřátý tuk.',
      'Opeč kuřecí prsa 6 minut z každé strany při 180 °C.',
      'Podávej ihned na talíři s oblohou.',
    ],
  });
  assert.ok(!vTuk.duvody.some((d) => d.includes('makroživiny')));
});

test('pravidlo: postup nesmí zmínit surovinu, která není v ingredients', () => {
  const v = posudPostup({
    nazev: 'Kuře s bramborem',
    suroviny: ['kuřecí prsa', 'brambory'],
    kroky: [
      'Brambory oloupej a nakrájej na kostky 2 cm.',
      'Vlož brambory do osolené vody a vař 15 minut.',
      'Kuřecí prsa osol a zalij smetanou, poté opeč 8 minut při 180 °C.',
      'Brambory sceď a podávej s kuřecím prsem na talíři.',
    ],
  });
  assert.equal(v.ok, false);
  assert.ok(v.duvody.some((d) => d.includes('mimo ingredients') && d.includes('smetana')));

  // Když je surovina opravdu v ingredients, halucinace se nehlásí.
  const vSSmetanou = posudPostup({
    nazev: 'Kuře na smetaně',
    suroviny: ['kuřecí prsa', 'smetana', 'brambory'],
    kroky: [
      'Brambory oloupej a nakrájej na kostky 2 cm.',
      'Vlož brambory do osolené vody a vař 15 minut.',
      'Kuřecí prsa osol a zalij smetanou, poté opeč 8 minut při 180 °C.',
      'Brambory sceď a podávej s kuřecím prsem na talíři.',
    ],
  });
  assert.ok(!vSSmetanou.duvody.some((d) => d.includes('mimo ingredients')));
});

test('slovoJeVTextu: shoda smí vzniknout jen mezi tvary téhož slova, ne mezi cizími slovy se stejným začátkem', () => {
  // FALEŠNÝ POZITIV: „syrové" se nesmí počítat jako výskyt „sýr".
  assert.equal(slovoJeVTextu('syr', slovaTextu('syrove brambory')), false);
  // FALEŠNÝ POZITIV: „medvědí" se nesmí počítat jako výskyt „med".
  assert.equal(slovoJeVTextu('med', slovaTextu('medvedi cesnek')), false);
  // FALEŠNÝ NEGATIV: „rýži" je pád „rýže", čtyřznaková slova se taky ořezávají.
  assert.equal(slovoJeVTextu('ryze', slovaTextu('uvar ryzi')), true);
  // Skutečný pád musí projít i s delší koncovkou („syrem").
  assert.equal(slovoJeVTextu('syr', slovaTextu('nastrouhej syrem')), true);
  // Skutečný pád musí projít i opačným směrem (kratší tvar v textu).
  assert.equal(slovoJeVTextu('brambory', slovaTextu('oloupej brambor')), true);
});

test('celý naměřený případ: syrové brambory a slaná voda neprojdou jako halucinovaný sýr/slanina', () => {
  // Reálný postup z hlášení chyby — dřív ho laťka zamítla („syrové" =>
  // halucinovaný „sýr"). Musí teď projít beze zbytku.
  const v = posudPostup({
    nazev: 'Kuře s bramborem',
    suroviny: ['210 g kuřecí prsa', '310 g brambory', '10 g olivový olej'],
    kroky: [
      'Oloupej syrové brambory a nakrájej je na kostky 2 cm.',
      'Rozehřej olivový olej na pánvi na střední teplotu.',
      'Opeč kuřecí prsa z obou stran, celkem asi 12 minut.',
      'Uvař brambory ve slané vodě 20 minut a sceď je.',
    ],
  });
  assert.deepEqual(v.duvody, []);
  assert.equal(v.ok, true);
});

test('prázdný vstup neprojde a nespadne', () => {
  const v = posudPostup({});
  assert.equal(v.ok, false);
  assert.ok(v.duvody.length > 0);

  assert.doesNotThrow(() => posudPostup(undefined));
  assert.doesNotThrow(() => posudPostup({ kroky: null, suroviny: null }));
});

test('kontrola diakritiky nepadá na malých/velkých písmenech ani na koncovkách', () => {
  const v = posudPostup({
    nazev: 'Test',
    suroviny: ['Kuřecí Prsa'],
    kroky: [
      'OSOL kuřecí prsa a NECH chvíli odpočinout.',
      'Opeč kuřecí prsa na pánvi 8 minut při 180 °C.',
      'Podávej ihned s oblohou podle chuti a servíruj.',
      'Ozdob bylinkami a naservíruj na talíř.',
    ],
  });
  assert.ok(!v.duvody.some((d) => d.includes('nezačíná rozkazovacím slovesem')));
  assert.ok(!v.duvody.some((d) => d.includes('nezmiňuje surovinu')));
});
