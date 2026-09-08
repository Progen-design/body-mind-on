/**
 * Laťka kvality postupu — recepty musí mít skutečný postup, ne vatu.
 *
 * DRUHÉ KOLO (9. 9. 2026): `posudPostup()` vrací `{ ok, duvody, varovani }`.
 * `ok` se řídí VÝHRADNĚ `duvody` (blokující pravidla — jednoznačná, bez
 * enumerace slov). `varovani` se loguje, nikdy neblokuje zápis a nikdy
 * nespouští přepis. Testy jsou rozdělené podle toho, co je teď která
 * kontrola: blokující testuje `ok`/`duvody`, varovná testuje `varovani`
 * a `ok === true` zároveň.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  posudPostup,
  slovoJeVTextu,
  slovaTextu,
  prahDelkyPostupu,
  zkontrolujKonzistenciSurovin,
  MIN_KROKU,
  MIN_DELKA_POSTUPU,
  MIN_DELKA_NA_SUROVINU,
  MIN_DELKA_ZAKLAD,
} from '../plan/kvalitaPostupu.js';

/** Dobrý postup, který má projít vším bez jediného varování. */
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

test('dobrý postup projde beze zbytku, bez důvodů i bez varování', () => {
  const v = posudPostup(DOBRY_POSTUP);
  assert.deepEqual(v.duvody, []);
  assert.deepEqual(v.varovani, []);
  assert.equal(v.ok, true);
});

// --- BLOKUJÍCÍ PRAVIDLA -----------------------------------------------------

test('BLOKUJE: min. počet kroků', () => {
  const v = posudPostup({ ...DOBRY_POSTUP, kroky: DOBRY_POSTUP.kroky.slice(0, 2) });
  assert.equal(v.ok, false);
  assert.ok(v.duvody.some((d) => d.includes(`míň než ${MIN_KROKU} kroky`)));
});

test('BLOKUJE: min. délka postupu, ale JEN spolu s málo kroky (samostatně nesmí — 219 falešných zásahů)', () => {
  // Krátký text A ZÁROVEŇ míň než 4 kroky — oba důvody, potvrzují se navzájem.
  const kratkyAMaloKroku = posudPostup({
    nazev: 'Test',
    suroviny: ['kuřecí prsa', 'brambory', 'cuketa', 'mrkev'],
    kroky: ['Osol maso.', 'Opeč maso.', 'Podávej maso.'],
  });
  assert.equal(kratkyAMaloKroku.ok, false);
  assert.ok(kratkyAMaloKroku.duvody.some((d) => d.includes(`míň než ${MIN_KROKU} kroky`)));
  assert.ok(kratkyAMaloKroku.duvody.some((d) => d.includes(`min. je ${MIN_DELKA_POSTUPU}`)));

  // Stejně krátký text, ale 4 kroky — délka SAMA O SOBĚ neblokuje.
  const kratkyAleDostKroku = posudPostup({
    nazev: 'Test',
    suroviny: ['kuřecí prsa', 'brambory', 'cuketa', 'mrkev'],
    kroky: ['Osol maso.', 'Opeč maso.', 'Podávej maso.', 'Ozdob maso.'],
  });
  assert.ok(
    !kratkyAleDostKroku.duvody.some((d) => d.includes('celý postup má jen')),
    'krátký text s dost kroky nesmí blokovat sám o sobě — přesně tenhle vzor dal 219 falešných zásahů'
  );
});

test('CHYBA 4: prahDelkyPostupu() škáluje s počtem hlavních surovin, ne pevných 200', () => {
  assert.equal(prahDelkyPostupu(4), MIN_DELKA_POSTUPU);
  assert.equal(prahDelkyPostupu(3), MIN_DELKA_NA_SUROVINU * 3);
  assert.equal(prahDelkyPostupu(1), MIN_DELKA_ZAKLAD);
  assert.equal(prahDelkyPostupu(0), MIN_DELKA_ZAKLAD);
});

test('BLOKUJE: krok není jen „Připrav X"/„Nachystej X" bez dalšího obsahu — tohle JE ta vata', () => {
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

test('BLOKUJE: postup nesmí uvádět kcal ani makra v textu', () => {
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

test('BLOKUJE: prázdný název', () => {
  const v = posudPostup({ ...DOBRY_POSTUP, nazev: '   ' });
  assert.equal(v.ok, false);
  assert.ok(v.duvody.some((d) => d.includes('nemá název')));
});

test('původní vata ze screenshotu (3 kroky, „Připrav brambory (syrové)."): pořád ok === false', () => {
  const v = posudPostup({
    nazev: 'Kuře s bramborem',
    suroviny: ['brambory', 'kuřecí prsa'],
    kroky: [
      'Připrav brambory (syrové).',
      'Upeč nebo opeč kuřecí prsa na oleji.',
      'Doplň zeleninou a podávej jako jednu porci.',
    ],
  });
  assert.equal(v.ok, false);
});

// --- ZAHOZENO ÚPLNĚ: „krok obsahuje rozkazovací sloveso" -------------------

test('ZAHOZENO: enumerace sloves už NIC neblokuje — 1053 zásahů byl důkaz, že metoda nefunguje', () => {
  const VETY_KTERE_NESMI_NIC_BLOKOVAT = [
    'Ovesné vločky nasyp do misky a zalij mlékem.',
    'Rozmícháme jogurt s medem a necháme odležet.',
    'Na opečený chléb nanes cottage a podávej.',
    'Přidej rajčata a duste 10 minut.',
    'Sůl a pepř podle chuti.',
  ];
  for (const veta of VETY_KTERE_NESMI_NIC_BLOKOVAT) {
    const v = posudPostup({
      nazev: 'Test',
      suroviny: ['x', 'y', 'z', 'w'],
      kroky: [veta, veta, veta, veta],
    });
    assert.deepEqual(v.duvody, [], `nesmí nic blokovat: „${veta}"`);
    assert.equal(v.ok, true, `nesmí nic blokovat: „${veta}"`);
  }
});

// --- VAROVNÁ PRAVIDLA — logují se, ok zůstává true --------------------------

test('VAROVÁNÍ: chybějící surovina se loguje, ale neblokuje ani nespustí přepis', () => {
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
  assert.equal(v.ok, true);
  assert.deepEqual(v.duvody, []);
  assert.ok(v.varovani.some((w) => w.includes('nezmiňuje surovinu') && w.includes('rýže')));

  // Koření a základ (sůl, olej, voda...) se vynechávat smí, ani jako varování.
  assert.ok(!v.varovani.some((w) => w.includes('sůl')));
});

test('VAROVÁNÍ: tepelná úprava bez teploty/času se loguje, ale neblokuje', () => {
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
  assert.equal(v.ok, true);
  assert.deepEqual(v.duvody, []);
  assert.ok(v.varovani.some((w) => w.includes('tepelná úprava bez teploty i bez času')));

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
  assert.ok(!vSCasem.varovani.some((w) => w.includes('tepelná úprava')));
});

test('CHYBA 2: „opečený" (přídavné jméno) nespouští ani varování o tepelné úpravě, „opeč" (sloveso) ano', () => {
  const studenaSvacina = posudPostup({
    nazev: 'Cottage na topince',
    suroviny: ['cottage sýr', 'celozrnný chléb', 'rajče'],
    kroky: [
      'Chléb dej do toustovače a nastav střední stupeň.',
      'Na opečený chléb nanes cottage sýr rovnoměrně po celé ploše.',
      'Rajče nakrájej na plátky a rozlož navrch.',
      'Podávej ihned na talíři s bylinkami.',
    ],
  });
  assert.equal(studenaSvacina.ok, true);
  assert.ok(
    !studenaSvacina.varovani.some((w) => w.includes('tepelná úprava')),
    '„opečený chléb" je studená svačina se studeným chlebem, ne tepelná úprava v tomhle kroku'
  );

  const teplaUprava = posudPostup({
    nazev: 'Kuře na pánvi',
    suroviny: ['kuřecí prsa'],
    kroky: [
      'Kuřecí prsa osol ze všech stran.',
      'Opeč kuřecí prsa na pánvi.',
      'Nech chvíli odpočinout na talíři.',
      'Podávej ihned s oblohou podle chuti.',
    ],
  });
  assert.equal(teplaUprava.ok, true);
  assert.ok(
    teplaUprava.varovani.some((w) => w.includes('tepelná úprava bez teploty i bez času')),
    '„Opeč kuřecí prsa na pánvi." je skutečná tepelná úprava a chybí jí teplota i čas — pořád varování, ne blokace'
  );
});

test('VAROVÁNÍ: surovina mimo ingredients se loguje, ale neblokuje ani nespustí přepis', () => {
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
  assert.equal(v.ok, true);
  assert.deepEqual(v.duvody, []);
  assert.ok(v.varovani.some((w) => w.includes('mimo ingredients') && w.includes('smetana')));

  // Když je surovina opravdu v ingredients, halucinace se nehlásí ani jako varování.
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
  assert.ok(!vSSmetanou.varovani.some((w) => w.includes('mimo ingredients')));
});

test('CHYBA 3: recept #484 — surovina "rajče" a krok "Přidej rajčata" nesmí dostat ani jeden z obou varování', () => {
  const v = posudPostup({
    nazev: 'Dušená rajčata s cibulí',
    suroviny: ['rajče', 'cibule', 'olivový olej'],
    kroky: [
      'Cibuli oloupej a nakrájej najemno.',
      'Na pánvi rozpal olivový olej a osmaž cibuli dozlatova.',
      'Přidej rajčata a duste 10 minut na mírném ohni.',
      'Podávej horké s čerstvým pečivem na talíři.',
    ],
  });
  assert.equal(v.ok, true);
  assert.ok(!v.varovani.some((w) => w.includes('nezmiňuje surovinu') && w.includes('rajče')));
  assert.ok(!v.varovani.some((w) => w.includes('mimo ingredients') && w.includes('rajcata')));
});

test('CHYBA 3: vnitřní konzistence — zkontrolujKonzistenciSurovin() spadne na jakémkoli páru, který jsouTvaryTehozSlova považuje za stejné slovo', () => {
  // Recept #484 dřív dostal NAJEDNOU „nezmiňuje surovinu: rajče" a „zmiňuje
  // surovinu mimo ingredients: rajcata" — logický spor, protože obě
  // pravidla mluvila o téže surovině (obě jsou od druhého kola jen
  // varovná, ale pojistka platí stejně — sama sebe testuje přímo, ne přes
  // celý posudPostup).
  assert.throws(() => zkontrolujKonzistenciSurovin(['rajce'], ['rajcata']), /logický spor/);
  assert.throws(() => zkontrolujKonzistenciSurovin(['syr'], ['syrem']), /logický spor/);

  // Nesouvisející slova (nejsou tvar téhož) spor nezakládají.
  assert.doesNotThrow(() => zkontrolujKonzistenciSurovin(['brambory'], ['rajcata']));
  assert.doesNotThrow(() => zkontrolujKonzistenciSurovin([], []));
});

test('recept se 6 kroky a ~677 znaky, který má varování, ale žádný blokující důvod -> ok === true, varovani.length > 0', () => {
  const kroky = [
    'Cibuli oloupej a nakrájej najemno na malé kostičky, dokud nebude jemná a rovnoměrná po celé ploše prkénka.',
    'Na pánvi rozehřej olivový olej na středním plameni a přidej nakrájenou cibuli k pomalému orestování dozlatova.',
    'Kuřecí prsa nakrájej na tenké proužky a přidej k cibuli na pánev, promíchej a nech chvíli táhnout dohromady.',
    'Opeč všechno dohromady na mírném ohni, dokud maso pěkně nezbělá a cibule nezesklovatí po celém povrchu pánve.',
    'Osol, opepři a přidej oblíbené koření podle chuti, aby chutě dobře zvýraznily a doplnily celé jídlo na talíři.',
    'Podávej horké přímo na talíři s čerstvým pečivem nebo oblíbenou přílohou podle vlastní chuti a nálady dne.',
  ];
  const v = posudPostup({
    nazev: 'Kuře s cibulí',
    suroviny: ['kuřecí prsa', 'cibule', 'olivový olej'],
    kroky,
  });
  assert.equal(kroky.length, 6);
  assert.ok(kroky.join(' ').length > 600, 'sanity: fixtura má být dost dlouhá, ne náhodou krátká');
  assert.deepEqual(v.duvody, []);
  assert.equal(v.ok, true);
  assert.ok(v.varovani.length > 0, 'postup má „opeč" bez teploty/času — musí zůstat aspoň jedno varování');
});

// --- Sdílené porovnávání slov (beze změny v tomhle kole) --------------------

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
  // halucinovaný „sýr"). Musí projít beze zbytku, bez důvodů i bez varování.
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
  assert.deepEqual(v.varovani, []);
  assert.equal(v.ok, true);
});

test('prázdný vstup neprojde a nespadne', () => {
  const v = posudPostup({});
  assert.equal(v.ok, false);
  assert.ok(v.duvody.length > 0);
  assert.ok(Array.isArray(v.varovani));

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
  assert.equal(v.ok, true);
  assert.deepEqual(v.duvody, []);
  assert.ok(!v.varovani.some((w) => w.includes('nezmiňuje surovinu')));
});
