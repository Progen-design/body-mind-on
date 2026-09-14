import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHIPY_POHYBOVYCH_VZORU,
  chipyNaPatterny,
  patternyNaChipy,
  sestavTreninkoveOmezeni,
  textZbyvajicichCviku,
  jeVyberExtremni,
  PRAH_VAROVANI_ZBYVAJICICH_CVIKU,
  TEXT_VAROVANI_EXTREMNI_VYBER,
} from './treninkovaOmezeni.ts';
import { planExclusionCoverage, EXCLUDABLE_PATTERNS } from '../../lib/trainingExclusions.js';

test('sedm chipů přesně podle zadání kroku 3, ve stejném pořadí', () => {
  assert.deepEqual(
    CHIPY_POHYBOVYCH_VZORU.map((c) => c.label),
    [
      'Dřepy a výpady',
      'Mrtvý tah a předklony',
      'Skoky a doskoky',
      'Tlaky nad hlavu',
      'Kliky a tlaky',
      'Cviky vleže na zemi',
      'Běh a poskoky',
    ]
  );
});

test('"Dřepy a výpady" pokrývá squat i lunge', () => {
  assert.deepEqual(chipyNaPatterny(['drepy_vypady']), ['squat', 'lunge']);
});

test('"Cviky vleže na zemi" mapuje na virtuální vzor floor, ne na žádný z jedenácti', () => {
  assert.deepEqual(chipyNaPatterny(['vlezeVleze']), ['floor']);
});

test('víc chipů se sloučí bez duplicit', () => {
  const patterny = chipyNaPatterny(['drepy_vypady', 'mrtvy_tah_predklony', 'skoky_doskoky']);
  assert.deepEqual(new Set(patterny), new Set(['squat', 'lunge', 'hinge', 'plyo']));
});

test('neznámé/prázdné id chipu nespadne, prostě nic nepřidá', () => {
  assert.deepEqual(chipyNaPatterny([]), []);
  assert.deepEqual(chipyNaPatterny(['neexistujici_chip']), []);
});

test('patternyNaChipy je opačný směr k chipyNaPatterny (předvyplnění)', () => {
  assert.deepEqual(patternyNaChipy(['hinge']), ['mrtvy_tah_predklony']);
  assert.deepEqual(new Set(patternyNaChipy(['squat'])), new Set(['drepy_vypady']));
});

test('sestavTreninkoveOmezeni bere už přeložené vzory (výstup chipyNaPatterny), ne chipy', () => {
  const vysledek = sestavTreninkoveOmezeni(
    chipyNaPatterny(['drepy_vypady']),
    ['shoulders', 'shoulders'],
    'onboarding'
  );
  assert.deepEqual(vysledek.patterns, ['squat', 'lunge']);
  assert.deepEqual(vysledek.muscles, ['shoulders']);
  assert.deepEqual(vysledek.exercise_keys, []);
  assert.deepEqual(vysledek.contraindications, []);
  assert.equal(vysledek.source, 'onboarding');
  assert.ok(!Number.isNaN(Date.parse(vysledek.updated_at)));
});

test('sestavTreninkoveOmezeni dedupluje vzory i partie', () => {
  const vysledek = sestavTreninkoveOmezeni(['squat', 'squat', 'hinge'], ['glutes', 'glutes'], 'profile');
  assert.deepEqual(vysledek.patterns, ['squat', 'hinge']);
  assert.deepEqual(vysledek.muscles, ['glutes']);
});

test('textZbyvajicichCviku skloňuje a volitelně přidá partii', () => {
  assert.equal(textZbyvajicichCviku(1, null), 'Zbývá 1 cvik.');
  assert.equal(textZbyvajicichCviku(3, null), 'Zbývá 3 cviky.');
  assert.equal(textZbyvajicichCviku(14, null), 'Zbývá 14 cviků.');
  assert.equal(textZbyvajicichCviku(14, 2), 'Zbývá 14 cviků, na vybranou partii 2.');
  assert.equal(textZbyvajicichCviku(0, 0), 'Zbývá 0 cviků, na vybranou partii 0.');
});

// --- Živé varování při extrémním výběru (docs zadání "Live varování a
// měkký strop u vyloučení cviků") ------------------------------------------
// Práh je na `remaining` z planExclusionCoverage(), NE na počtu vybraných
// chipů — proto se tu testuje přes skutečnou funkci z lib/trainingExclusions.js,
// ne přes vymyšlená čísla.

test('jeVyberExtremni je čistá hranice na "remaining", ne na počtu vzorů', () => {
  assert.equal(jeVyberExtremni(PRAH_VAROVANI_ZBYVAJICICH_CVIKU), false, 'přesně na hranici (3) varování ještě NEUKAZUJEME');
  assert.equal(jeVyberExtremni(PRAH_VAROVANI_ZBYVAJICICH_CVIKU - 1), true);
  assert.equal(jeVyberExtremni(0), true);
  assert.equal(jeVyberExtremni(100), false);
});

test('výběr pod prahem (7 vzorů v gymu, remaining=3): varování se NEUKÁŽE', () => {
  const patterns = EXCLUDABLE_PATTERNS.slice(0, 7);
  const pokryti = planExclusionCoverage({ patterns }, 'gym');
  assert.equal(pokryti.remaining, 3, 'změřená hodnota se změnila — přepočítej práh v hlavičce jeVyberExtremni');
  assert.equal(jeVyberExtremni(pokryti.remaining), false);
});

test('výběr nad prahem (8 vzorů + 3 partie v gymu, replikace zadaného scénáře): varování SE ukáže', () => {
  const patterns = EXCLUDABLE_PATTERNS.slice(0, 8);
  const muscles = ['chest', 'back', 'shoulders'];
  const pokryti = planExclusionCoverage({ patterns, muscles }, 'gym');
  assert.ok(pokryti.remaining < PRAH_VAROVANI_ZBYVAJICICH_CVIKU, `remaining=${pokryti.remaining} čekal jsem pod prahem`);
  assert.equal(jeVyberExtremni(pokryti.remaining), true);
});

test('zúžení výběru pod práh: varování zmizí', () => {
  const siroky = planExclusionCoverage({ patterns: EXCLUDABLE_PATTERNS.slice(0, 8) }, 'gym');
  assert.equal(jeVyberExtremni(siroky.remaining), true, 'výchozí širší výběr musí ještě varovat');

  const zuzeny = planExclusionCoverage({ patterns: EXCLUDABLE_PATTERNS.slice(0, 6) }, 'gym');
  assert.equal(jeVyberExtremni(zuzeny.remaining), false, 'po zúžení musí varování zmizet');
});

test('práh platí napříč všemi třemi prostředími, ne jen gymem', () => {
  for (const env of ['gym', 'home_equipment', 'home_bodyweight']) {
    const bezVyberu = planExclusionCoverage({}, env);
    assert.equal(jeVyberExtremni(bezVyberu.remaining), false, `${env}: bez vyloučení nesmí varovat`);

    const vsechnyVzory = planExclusionCoverage({ patterns: [...EXCLUDABLE_PATTERNS] }, env);
    assert.equal(jeVyberExtremni(vsechnyVzory.remaining), true, `${env}: vyloučení úplně všeho musí varovat`);
  }
});

test('text varování je přesně podle zadání a nic neblokuje (jen informuje)', () => {
  assert.equal(
    TEXT_VAROVANI_EXTREMNI_VYBER,
    'Při tomhle výběru budou některé dny hodně krátké nebo se cvik bude opakovat. Plán se stejně vytvoří, jen bude chudší.'
  );
});

test('TreninkovaOmezeni.tsx varování vykresluje vedle "Zbývá X cviků", disclaimer zůstal', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const cesta = fileURLToPath(new URL('../components/registrace/TreninkovaOmezeni.tsx', import.meta.url));
  const zdroj = readFileSync(cesta, 'utf8');

  assert.match(zdroj, /jeVyberExtremni\(pokryti\.remaining\)/, 'komponenta musí počítat varování ze stejného `pokryti.remaining`, ne z nové konstanty');
  assert.match(zdroj, /TEXT_VAROVANI_EXTREMNI_VYBER/);
  assert.match(zdroj, /Slouží k úpravě plánu\. Nenahrazuje vyšetření u lékaře\./, 'disclaimer nesmí zmizet');
  assert.ok(
    zdroj.indexOf('textZbyvajicichCviku') < zdroj.indexOf('TEXT_VAROVANI_EXTREMNI_VYBER'),
    '"Zbývá X cviků" musí být nad varováním, ne pod ním'
  );
});

test('varování nic neblokuje — komponenta nepřidává disabled ani onZmena guard kvůli výběru', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const cesta = fileURLToPath(new URL('../components/registrace/TreninkovaOmezeni.tsx', import.meta.url));
  const zdroj = readFileSync(cesta, 'utf8');
  // generujeSe je jediný důvod k disabled (odesílá se plán) — žádný další.
  assert.equal((zdroj.match(/disabled=/g) || []).length, 1, 'nesmí přibýt další disabled podmínka kvůli extrémnímu výběru');
});
