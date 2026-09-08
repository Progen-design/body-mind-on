/**
 * Doplnění postupu receptů pod laťkou — pure funkce z
 * lib/plan/doplneniPostupuReceptu.js (síťové/DB volání testuje jen tvarem
 * zdrojáku, jako scripts/doplneni-postupu-cviku.mjs u postupCviku.test.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  nazevSkupiny,
  seskupPodleNazvu,
  vlozGramaze,
  sestavVstupProMetodu,
  sestavVstupProRecept,
  odhadniVstupniTokeny,
  DOPLNENI_PROMPT,
  DOPLNENI_PROMPT_SHA256,
} from '../plan/doplneniPostupuReceptu.js';

const KOREN = join(import.meta.dirname, '..', '..');

test('nazevSkupiny ořeže porční variantu a beze změny nechá recept bez varianty', () => {
  assert.equal(nazevSkupiny('Kuře s bramborem — porce 200/300'), 'Kuře s bramborem');
  assert.equal(nazevSkupiny('Kuře s bramborem — porce 150/90'), 'Kuře s bramborem');
  assert.equal(nazevSkupiny('Kuře s bramborem'), 'Kuře s bramborem');
  assert.equal(nazevSkupiny(''), '');
  assert.equal(nazevSkupiny(null), '');
});

test('seskupPodleNazvu seskupí varianty pod jeden klíč a recept bez jména dostane vlastní skupinu', () => {
  const recepty = [
    { id: 1, name_cs: 'Kuře s bramborem — porce 150/70' },
    { id: 2, name_cs: 'Kuře s bramborem — porce 200/300' },
    { id: 3, name_cs: 'Vejce natvrdo s pečivem' },
    { id: 4, name_cs: null },
  ];
  const skupiny = seskupPodleNazvu(recepty);
  assert.equal(skupiny.size, 3);
  assert.deepEqual(skupiny.get('Kuře s bramborem').map((r) => r.id), [1, 2]);
  assert.deepEqual(skupiny.get('Vejce natvrdo s pečivem').map((r) => r.id), [3]);
  assert.equal(skupiny.get('#4')[0].id, 4);
});

test('vlozGramaze doplní gramáž za CELÉ sousloví, ne doprostřed něj, a jen jednou', () => {
  const kroky = [
    'Osol kuřecí prsa a nech chvíli odpočinout.',
    'Opeč kuřecí prsa na pánvi 8 minut při 180 °C.',
    'Uvař brambory v osolené vodě 15 minut.',
    'Podávej kuřecí prsa s brambory na talíři.',
  ];
  const suroviny = [
    { name: 'kuřecí prsa', amount: 200, unit: 'g' },
    { name: 'brambory', amount: 300, unit: 'g' },
  ];
  const vysledek = vlozGramaze(kroky, suroviny);

  assert.equal(vysledek[0], 'Osol kuřecí prsa (200 g) a nech chvíli odpočinout.');
  assert.equal(vysledek[2], 'Uvař brambory (300 g) v osolené vodě 15 minut.');
  // Druhá a čtvrtá zmínka téže suroviny se nedoplňuje znovu.
  assert.equal(vysledek[1], 'Opeč kuřecí prsa na pánvi 8 minut při 180 °C.');
  assert.equal(vysledek[3], 'Podávej kuřecí prsa s brambory na talíři.');
});

test('vlozGramaze beze změny projde kroky, kde surovina chybí nebo nemá jednotku/množství', () => {
  const kroky = ['Osol maso a opeč ho 8 minut při 180 °C.'];
  assert.deepEqual(vlozGramaze(kroky, [{ name: 'sůl' }]), kroky);
  assert.deepEqual(vlozGramaze(kroky, [{ name: 'rýže', amount: 100, unit: 'g' }]), kroky);
  assert.deepEqual(vlozGramaze(kroky, []), kroky);
  assert.deepEqual(vlozGramaze(kroky, null), kroky);
});

test('sestavVstupProMetodu pošle jen názvy surovin, bez gramáže', () => {
  const vstup = sestavVstupProMetodu({
    nazev: 'Kuře s bramborem',
    suroviny: [{ name: 'kuřecí prsa', amount: 200, unit: 'g' }, { name: 'brambory', amount: 300, unit: 'g' }],
  });
  assert.equal(vstup.ukol, 'metoda_pro_skupinu');
  assert.deepEqual(vstup.suroviny, ['kuřecí prsa', 'brambory']);
  assert.equal(JSON.stringify(vstup).includes('200'), false);
});

test('sestavVstupProRecept pošle gramáž, protože jde o jeden konkrétní recept', () => {
  const vstup = sestavVstupProRecept({
    nazev: 'Kuře s bramborem',
    suroviny: [{ name: 'kuřecí prsa', amount: 200, unit: 'g' }],
  });
  assert.equal(vstup.ukol, 'postup_pro_recept');
  assert.deepEqual(vstup.suroviny, [{ name: 'kuřecí prsa', amount: 200, unit: 'g' }]);
});

test('odhadniVstupniTokeny vrací kladné číslo úměrné délce vstupu', () => {
  const maly = sestavVstupProRecept({ nazev: 'X', suroviny: [{ name: 'sůl', amount: 1, unit: 'g' }] });
  const velky = sestavVstupProRecept({
    nazev: 'Dlouhý název receptu s hodně surovinami',
    suroviny: Array.from({ length: 20 }, (_, i) => ({ name: `surovina ${i}`, amount: i + 1, unit: 'g' })),
  });
  assert.ok(odhadniVstupniTokeny(maly) > 0);
  assert.ok(odhadniVstupniTokeny(velky) > odhadniVstupniTokeny(maly));
});

test('prompt existuje v gitu, otisk sedí a nese obě zadání i zákaz kcal/vymýšlení', () => {
  const cesta = join(KOREN, 'prompts', 'recipe-instructions-rewrite.md');
  assert.ok(existsSync(cesta), 'prompt musí ležet v prompts/ (includeFiles ve vercel.json)');
  const obsah = readFileSync(cesta, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(DOPLNENI_PROMPT, obsah);
  assert.match(DOPLNENI_PROMPT_SHA256, /^[0-9a-f]{64}$/);

  assert.match(DOPLNENI_PROMPT, /metoda_pro_skupinu/);
  assert.match(DOPLNENI_PROMPT, /postup_pro_recept/);
  assert.match(DOPLNENI_PROMPT, /kcal/i);
  assert.match(DOPLNENI_PROMPT, /Nevymýšlej/i);
});

test('skript: má --dry-run/--zdroj/--limit, nevolá model na sucho a nikdy nezapíše postup, který neprojde laťkou', () => {
  const skript = readFileSync(join(KOREN, 'scripts', 'doplneni-postupu-receptu.mjs'), 'utf8');

  assert.match(skript, /'--dry-run'/);
  assert.match(skript, /'--zdroj='/);
  assert.match(skript, /'--limit='/);

  // Dry-run se vrátí (continue) DŘÍV, než přijde na řadu volání modelu.
  const dryRunGroup = skript.indexOf('if (dryRun) {\n      odhadovanychTokenu += odhadniVstupniTokeny(vstupMetoda);');
  const volaniGroup = skript.indexOf('zavolejModel(openai, vstupMetoda)');
  assert.ok(dryRunGroup > 0 && volaniGroup > dryRunGroup, 'u skupin se model nevolá, dokud se nerozhodne, že nejde o dry-run');

  // Zápis je vždy podmíněný výsledkem posudPostup(), nikdy napřímo po volání modelu.
  const zapisyPodleSkupin = [...skript.matchAll(/zapisPostup\(varianta\.id/g)];
  assert.ok(zapisyPodleSkupin.length >= 2, 'zápis skupinové varianty existuje v obou pokusech (první i retry)');
  const zapisJednotlivy = skript.indexOf('zapisPostup(recept.id');
  const posudekJednotlivy = skript.lastIndexOf('posudPostup(', zapisJednotlivy);
  assert.ok(posudekJednotlivy > 0 && posudekJednotlivy < zapisJednotlivy);

  // Retry je nejvýš jednou navíc (pokus <= 2), ne nekonečná smyčka.
  assert.match(skript, /pokus <= 2/);

  // Přeskočený recept se zaloguje s důvodem, ne tiše.
  assert.match(skript, /preskoceno\.push/);
});
