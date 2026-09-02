/**
 * Zadani bilkovin pro objednavku receptu.
 *
 * Hlidane riziko: sloupec `protein_hint` nese dve ruzne veci a porovnava se
 * jako RETEZEC v unikatnim indexu fronty. Kdyby serializace nemela pevne
 * poradi klicu, tataz dira by se objednala dvakrat.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';

import {
  KROK_PODILU,
  MAX_PODIL_HINTU,
  MAX_PODIL_OBJEDNAVKY,
  omezPodilProObjednavku,
  podilBilkovinReceptu,
  receptSplnujePodil,
  rozparsujHint,
  serializujHint,
} from '../plan/proteinHint.js';
import { MEZE_PODILU } from '../nutrition/cilBilkovinSlotu.js';

// ------------------------------------------------------------- serializace

test('samotny zdroj se uklada jako holy klic, ne jako JSON', () => {
  // Jinak by se nova objednavka nespojila se sedmi radky, ktere ve fronte uz jsou.
  assert.equal(serializujHint({ zdroj: 'ryby' }), 'ryby');
  assert.equal(serializujHint({ zdroj: 'ryby', podil: null }), 'ryby');
});

test('zdroj i podil davaji JSON v pevnem poradi klicu', () => {
  // 0,28 se pri zapisu kvantizuje na 0,3 — viz sekce kvantizace niz.
  assert.equal(serializujHint({ zdroj: 'ryby', podil: 0.28 }), '{"zdroj":"ryby","podil":0.3}');
});

test('samotny podil da JSON bez zdroje', () => {
  assert.equal(serializujHint({ podil: 0.3 }), '{"podil":0.3}');
});

test('poradi klicu je stabilni bez ohledu na poradi ve vstupu', () => {
  // Tohle je duvod, proc serializace nesmi byt JSON.stringify na volajicim
  // miste: unikat fronty porovnava retezec.
  const a = serializujHint({ zdroj: 'ryby', podil: 0.28 });
  const b = serializujHint({ podil: 0.28, zdroj: 'ryby' });
  assert.equal(a, b);
});

test('bez zadani se neuklada nic', () => {
  assert.equal(serializujHint({}), null);
  assert.equal(serializujHint(null), null);
  assert.equal(serializujHint({ zdroj: '  ', podil: 0 }), null);
});

// ------------------------------------------------------------- kvantizace
//
// DEDUP FRONTY NA TOMHLE STOJI. Unikatni index porovnava protein_hint jako
// RETEZEC, ne cislo. cilPodiluProZbytekDne vraci spojitou hodnotu, takze bez
// kvantizace by kazde sestaveni planu zalozilo vlastni objednavku na tutez
// diru a komentar v recipesCatalog.js o tom, ze "duplicitni specifikaci
// zahodi unikatni index", by byl nepravdivy.

test('dve blizke hodnoty daji TENTYZ retezec', () => {
  // Presne pripad ze zadani: 0,28 i 0,31 je tataz dira.
  assert.equal(serializujHint({ podil: 0.28 }), serializujHint({ podil: 0.31 }));
});

test('drobny rozdil v podilu nezalozi druhou objednavku', () => {
  const a = serializujHint({ podil: 0.283 });
  const b = serializujHint({ podil: 0.284 });

  assert.equal(a, b, 'tisiciny nesmi tristit frontu');
  assert.equal(a, '{"podil":0.3}');
});

test('cele pasmo podilu ma jen tolik hodnot, kolik je kroku', () => {
  // Bez kvantizace by jich pri zaokrouhleni na tisiciny bylo 401.
  const vysledky = new Set();
  for (let x = 0.15; x <= MEZE_PODILU.MAX_PODIL + 1e-9; x += 0.001) {
    vysledky.add(serializujHint({ podil: x }));
  }

  const ocekavano = Math.round((MEZE_PODILU.MAX_PODIL - 0.15) / KROK_PODILU) + 1;
  assert.equal(vysledky.size, ocekavano, `ceka se ${ocekavano} hodnot, ne ${vysledky.size}`);
  assert.ok(vysledky.size <= 12, 'pasmo se nesmi tristit');
});

test('kvantizuje se na nasobek KROK_PODILU', () => {
  for (const vstup of [0.07, 0.19, 0.26, 0.42, 0.53]) {
    const podil = rozparsujHint(serializujHint({ podil: vstup })).podil;
    const zbytek = Math.abs(Math.round(podil / KROK_PODILU) * KROK_PODILU - podil);
    assert.ok(zbytek < 1e-9, `${podil} neni nasobek ${KROK_PODILU}`);
  }
});

test('podil nad stropem se orizne, ne odmitne', () => {
  assert.equal(serializujHint({ podil: 0.95 }), `{"podil":${MAX_PODIL_HINTU}}`);
});

// ------------------------------------------------------------------ strop

test('strop je tentyz jako v cilBilkovinSlotu, ne druha hranice', () => {
  // Vlastni vyssi strop by udelal mrtve pasmo: cilPodiluProZbytekDne
  // orezava na MAX_PODIL, takze nad nej se hodnota nikdy nedostane.
  assert.equal(MAX_PODIL_HINTU, MEZE_PODILU.MAX_PODIL);
});

test('prahShodnySMigraci — CHECK v migraci ma tentyz strop jako kod', () => {
  // Kdyby se rozesly, bud by DB odmitla hodnotu, kterou kod povazuje za
  // platnou, nebo by pustila vyssi, nez kod umi vyrobit.
  const sql = fs.readFileSync('supabase/migrations/20260823120000_protein_hint_nese_i_podil.sql', 'utf8');
  const shody = [...sql.matchAll(/'podil'\)::numeric\s*<=\s*([0-9.]+)/g)].map((m) => Number(m[1]));

  assert.equal(shody.length, 1, `v migraci ma byt prave jeden strop, nalezeno ${shody.length}`);
  assert.equal(shody[0], MEZE_PODILU.MAX_PODIL, 'migrace a kod se rozesly');
});

// ---------------------------------------------------------------- parsovani

test('sedm starsich radku s holym klicem se cte dal', () => {
  // Zpetna kompatibilita. Kdyby prestala platit, vypne se rotace bilkovin.
  assert.deepEqual(rozparsujHint('ryby'), { zdroj: 'ryby', podil: null });
  assert.deepEqual(rozparsujHint('  lusteniny '), { zdroj: 'lusteniny', podil: null });
});

test('JSON se rozlozi na zdroj a podil', () => {
  assert.deepEqual(rozparsujHint('{"zdroj":"ryby","podil":0.3}'), { zdroj: 'ryby', podil: 0.3 });
  assert.deepEqual(rozparsujHint('{"podil":0.3}'), { zdroj: null, podil: 0.3 });
});

test('cteni NEKVANTIZUJE — brana se ridi tim, co je ulozene', () => {
  // Kdyby se kvantizovalo i pri cteni, objednavka s 0,28 by v prejimce
  // zahazovala recepty proti prahu 0,30, tedy prisneji, nez si rekla.
  assert.equal(rozparsujHint('{"podil":0.28}').podil, 0.28);
  assert.equal(rozparsujHint('{"podil":0.283}').podil, 0.283);
});

test('co se zapise, to se precte zpatky beze zmeny', () => {
  // Kolo tam a zpet musi byt stabilni: uz kvantizovana hodnota se pri dalsim
  // zapisu nesmi posunout, jinak by se objednavka rozdvojila pri kazdem cyklu.
  for (const zadani of [
    { zdroj: 'ryby', podil: 0.3 },
    { zdroj: 'hovezi', podil: null },
    { zdroj: null, podil: 0.35 },
  ]) {
    const tam = serializujHint(zadani);
    const zpet = rozparsujHint(tam);
    assert.equal(zpet.zdroj, zadani.zdroj ?? null);
    assert.equal(zpet.podil, zadani.podil ?? null);
    assert.equal(serializujHint(zpet), tam, 'druhy zapis musi dat tentyz retezec');
  }
});

test('rozbity radek generator neshodi', () => {
  // Radek ve fronte muze byt cokoli; vyjimka by zabila cely beh.
  for (const nesmysl of ['{', '{"podil":', 'null', '[]', '{"podil":"hodne"}', '', null, undefined, 42]) {
    assert.doesNotThrow(() => rozparsujHint(nesmysl));
  }
  assert.deepEqual(rozparsujHint('{'), { zdroj: null, podil: null });
  assert.deepEqual(rozparsujHint('{"podil":"hodne"}'), { zdroj: null, podil: null });
});

// ------------------------------------------------------------------- brana

test('podil bilkovin se pocita z ulozenych maker', () => {
  // 30 g bilkovin pri 400 kcal = 120 kcal ze 400 = 30 %.
  assert.equal(Math.round(podilBilkovinReceptu({ kcal: 400, protein_g: 30 }) * 100), 30);
});

test('bez kcal nebo bez bilkovin se podil nepocita', () => {
  assert.equal(podilBilkovinReceptu({ kcal: 0, protein_g: 30 }), null);
  assert.equal(podilBilkovinReceptu({ kcal: 400 }), null);
  assert.equal(podilBilkovinReceptu(null), null);
});

test('brana zahazuje jen to, o cem ma dukaz', () => {
  // Bez zadani projde vsechno.
  assert.equal(receptSplnujePodil({ kcal: 400, protein_g: 5 }, null), true);
  // Bez spocitatelneho podilu taky — nula by tvrdila neco, co nevime.
  assert.equal(receptSplnujePodil({ kcal: 0, protein_g: 0 }, 0.28), true);
});

test('recept pod zadanym podilem neprojde, nad nim ano', () => {
  const chudy = { kcal: 400, protein_g: 10 };   // 10 %
  const bohaty = { kcal: 400, protein_g: 30 };  // 30 %

  assert.equal(receptSplnujePodil(chudy, 0.28), false);
  assert.equal(receptSplnujePodil(bohaty, 0.28), true);
});

test('presne na prahu recept projde', () => {
  // Prah je minimum, ne hranice, kterou je treba prekonat.
  assert.equal(receptSplnujePodil({ kcal: 400, protein_g: 28 }, 0.28), true);
});

// ---------------------------------------------- strop pro objednavku (8.5)

test('MAX_PODIL_OBJEDNAVKY je 0,25 — posledni hodnota s vysokou uspesnosti', () => {
  // Zmereno 2. 9. 2026 (docs/DALSI_KROK.md 8.5): 0,25 -> 67 %, 0,30 -> 3 %.
  assert.equal(MAX_PODIL_OBJEDNAVKY, 0.25);
  assert.ok(MAX_PODIL_OBJEDNAVKY < MAX_PODIL_HINTU, 'strop objednavky musi byt pod stropem vypoctu');
});

test('podil nad stropem objednavky se orizne, ne odmitne', () => {
  assert.equal(omezPodilProObjednavku(0.55), MAX_PODIL_OBJEDNAVKY);
  assert.equal(omezPodilProObjednavku(0.4), MAX_PODIL_OBJEDNAVKY);
  assert.equal(omezPodilProObjednavku(0.3), MAX_PODIL_OBJEDNAVKY);
});

test('podil pod stropem projde beze zmeny', () => {
  assert.equal(omezPodilProObjednavku(0.2), 0.2);
  assert.equal(omezPodilProObjednavku(0.25), 0.25);
});

test('chybejici nebo nesmyslny podil da null, ne 0 ani NaN', () => {
  assert.equal(omezPodilProObjednavku(null), null);
  assert.equal(omezPodilProObjednavku(undefined), null);
  assert.equal(omezPodilProObjednavku(0), null);
  assert.equal(omezPodilProObjednavku(-0.3), null);
  assert.equal(omezPodilProObjednavku('nesmysl'), null);
});
