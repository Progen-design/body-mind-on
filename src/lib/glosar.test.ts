// Glosar nahrazuje to, co mel obstarat predstirany chat s TEDem: uzivatel se
// doptá bez AI, okamzite a determisticky.
//
// Testy hlidaji hlavne to, co se da tise pokazit — pojem bez vysvetleni,
// vysvetlivku k necemu, co v UI neni, a hodnotici tón u zdravotnich udaju.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { GLOSAR, POJMY, najdiPojem } from '../../lib/glosar.js';
import { POJEM_PRO_METRIKU } from '../../lib/glosarMetrik.js';

test('každý pojem má id, název i vysvětlení', () => {
  for (const [klic, z] of Object.entries(GLOSAR)) {
    assert.equal(z.id, klic, `id neodpovida klici u ${klic}`);
    assert.ok(z.pojem.trim().length > 0, `${klic} nema nazev`);
    assert.ok(z.vysvetleni.trim().length > 40, `${klic} ma prilis kratke vysvetleni`);
  }
});

test('vysvětlení má dvě až tři věty, ne odstavec', () => {
  for (const z of POJMY) {
    const vet = z.vysvetleni.split(/[.!?]\s/).filter((v) => v.trim().length > 0).length;
    assert.ok(vet >= 2 && vet <= 4, `${z.id} ma ${vet} vet, ceka se 2-3`);
    assert.ok(z.vysvetleni.length < 420, `${z.id} je prilis dlouhe (${z.vysvetleni.length} znaku)`);
  }
});

test('u zdravotních pojmů se nehodnotí ani nediagnostikuje', () => {
  // "Bez dat zadny zaver" plati i pro texty. Vysvetlivka rika, CO ten udaj je,
  // ne co ma uzivatel delat nebo jak na tom je.
  const zakazane = [
    /\bměl bys\b/i,
    /\bdoporučujeme\b/i,
    /\bdoporučuje se\b/i,
    /\btvoje\s+\w+\s+je\s+(nízk|vysok|špatn|dobr)/i,
    /\bznamená to, že jsi\b/i,
    /\bnemoc\w*\s+(máš|máte)\b/i
  ];

  for (const z of POJMY) {
    for (const vzor of zakazane) {
      assert.equal(vzor.test(z.vysvetleni), false, `${z.id} hodnoti nebo radi: ${vzor}`);
    }
  }
});

test('u HRV a klidového tepu se říká, že mezilidské srovnání nedává smysl', () => {
  // Nejcastejsi chybny zaver, ktery si clovek u techhle metrik udela sam.
  assert.match(GLOSAR.zakladna_hrv.vysvetleni, /porovnávat.*s někým|každý má/i);
  assert.match(GLOSAR.klidovy_tep.vysvetleni, /člověk od člověka|liší/i);
});

test('u odhadovaných hodnot je řečeno, že jde o odhad', () => {
  for (const id of ['visceralni_tuk', 'bazalni_metabolismus', 'aktivni_energie', 'spo2']) {
    assert.match(
      GLOSAR[id].vysvetleni,
      /odhad|orientační|dopočet|nemě[řr]í/i,
      `${id} neriká, ze jde o odhad, ne mereni`
    );
  }
});

test('najdiPojem vrátí null pro neznámé id, ne prázdné okno', () => {
  assert.equal(najdiPojem('neexistuje'), null);
  assert.equal(najdiPojem(''), null);
  assert.equal(najdiPojem(undefined as never), null);
  assert.equal(najdiPojem('constructor' as never), null, 'nesmi propustit vlastnosti prototypu');
  assert.equal(najdiPojem('hrv')?.pojem, 'HRV (variabilita srdečního tepu)');
});

test('RIR ani RPE v glosáři nejsou — v UI nejsou', () => {
  // Vysvetlivku ma jen pojem, ktery v aplikaci opravdu je. Obojí zmizelo
  // v Etape 3.3 spolu s vymyslenymi radami.
  assert.equal(najdiPojem('rir'), null);
  assert.equal(najdiPojem('rpe'), null);
});

/** Pojmy, na ktere se v `src/components` opravdu odkazuje. */
function pojmyVUi(): string[] {
  // Prosta cesta od korene repa — testy se spousti odtamtud (npm run test:src).
  const adresar = 'src/components';
  const nalezene: string[] = [];

  for (const f of fs.readdirSync(adresar).filter((n) => n.endsWith('.tsx'))) {
    const obsah = fs.readFileSync(`${adresar}/${f}`, 'utf8');
    // Pojem se predava bud primo (<Vysvetlivka pojem="hrv" />), nebo pres prop
    // jine komponenty (<Dlazdice … pojem="bmi" />). Kontroluji se oba tvary.
    for (const shoda of obsah.matchAll(/pojem="([a-z0-9_]+)"/g)) nalezene.push(shoda[1]);
  }

  // Dlazdice metrik z hodinek se vykresluji ve smycce podle toho, co posle
  // databaze — otaznik se u nich pripojuje pres mapu, ne natvrdo v JSX.
  // Bez tohohle by obousmerna kontrola nize hlasila, ze pojmy typu
  // "dechova_frekvence" v UI nejsou, prestoze tam jsou.
  nalezene.push(...Object.values(POJEM_PRO_METRIKU));

  return nalezene;
}

test('mapa metrik ukazuje jen na pojmy, které v glosáři existují', () => {
  for (const [metrika, pojem] of Object.entries(POJEM_PRO_METRIKU)) {
    assert.ok(najdiPojem(pojem), `metrika ${metrika} ukazuje na neexistujici pojem "${pojem}"`);
  }
});

test('každý pojem použitý v UI existuje v glosáři', () => {
  // Preklep v `<Vysvetlivka pojem="…">` by otaznik tise schoval.
  const nalezene = pojmyVUi();

  for (const id of nalezene) {
    assert.ok(najdiPojem(id), `pojem "${id}" je v UI, ale v glosari neni`);
  }

  assert.ok(nalezene.length >= 11, `ceka se aspon 11 otazniku v UI, nalezeno ${nalezene.length}`);
});

test('každý pojem z glosáře je někde v UI zakotvený', () => {
  // Opacny smer, a ten je dulezitejsi: glosar do zasoby se nedela. Bez tohohle
  // testu projde i pojem, ke kteremu otaznik nikdo nepripojil — a chyba je
  // tichá, protoze v UI proste nic nepribude.
  const nalezene = new Set(pojmyVUi());

  for (const z of POJMY) {
    assert.ok(nalezene.has(z.id), `pojem "${z.id}" ma vysvetleni, ale v UI k nemu neni otaznik`);
  }
});

test('zápis sérií pokrývá i variantu s časem', () => {
  assert.match(GLOSAR.zapis_serii.vysvetleni, /40 s|čas/i);
});
