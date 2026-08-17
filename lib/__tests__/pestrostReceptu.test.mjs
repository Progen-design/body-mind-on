/**
 * PESTROST: stejný recept nejvýš 2× týdně a nikdy 2× za den.
 *
 * Měřeno na plánu 25b7017a (17. 8. 2026): snídaně 2 různé ze 7 — jeden recept
 * čtyřikrát — a svačiny 6 ze 14, při 632 aktivních receptech v katalogu.
 * Nechyběli kandidáti, chyběl strop: týdenní vyloučení bylo jen MĚKKÁ preference
 * (`excludeIds`), kterou poslední stupně eskalace zahazovaly, aby slot vůbec
 * něco dostal.
 *
 * `tvrdaVylouceni` je proti tomu hranice, kterou eskalace přebít nesmí.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_OPAKOVANI_RECEPTU_TYDNE,
  tvrdaVylouceni,
  vycerpaneZaklady,
  zakladNazvuJidla,
} from '../plan/pestrostReceptu.js';

test('strop je dvě použití — třetí už ne', () => {
  assert.equal(MAX_OPAKOVANI_RECEPTU_TYDNE, 2,
    'dvakrát je meal prep, potřetí je to chudoba');
});

test('recept na stropu se vyloučí, pod stropem zůstane dostupný', () => {
  const out = tvrdaVylouceni(new Set(), new Map([
    ['jednou', 1],
    ['dvakrat', 2],
    ['trikrat', 3],
  ]));
  assert.equal(out.has('jednou'), false, 'po prvním použití smí přijít podruhé');
  assert.equal(out.has('dvakrat'), true, 'na stropu končí');
  assert.equal(out.has('trikrat'), true);
});

test('dnešní jídla jsou vyloučená bez ohledu na týdenní počet', () => {
  // Tohle je to pravidlo, které nesmí padnout ani v poslední eskalaci:
  // dvě svačiny v jednom dni nesmí být tentýž recept.
  const out = tvrdaVylouceni(new Set(['dnesni']), new Map());
  assert.equal(out.has('dnesni'), true);
});

test('obě pravidla platí zároveň a nepřepisují se', () => {
  const out = tvrdaVylouceni(new Set(['a']), new Map([['b', 2], ['c', 1]]));
  assert.deepEqual([...out].sort(), ['a', 'b']);
  assert.equal(out.has('c'), false, 'jednou použitý recept se ještě smí vrátit');
});

test('vstup se nemodifikuje — volající si sadu drží dál', () => {
  const dnes = new Set(['a']);
  const tyden = new Map([['b', 2]]);
  tvrdaVylouceni(dnes, tyden);
  assert.deepEqual([...dnes], ['a'], 'dnešní sada se nesmí rozšířit o týdenní strop');
  assert.equal(tyden.size, 1);
});

test('prázdný i chybějící vstup projde bez pádu', () => {
  assert.equal(tvrdaVylouceni(new Set(), new Map()).size, 0);
  assert.equal(tvrdaVylouceni(undefined, undefined).size, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Identita jídla podle názvu — strop na catalog_id sám o sobě nestačí.

test('porcové varianty téhož jídla mají stejný základ', () => {
  const stejne = [
    'Kuře s bramborem — porce 180/300',
    'Kuře s bramborem — porce 150/350',
    'Kuře s bramborem — velká porce',
    'Kuře s bramborem — XL',
    'Kuře s bramborem',
  ].map(zakladNazvuJidla);
  assert.equal(new Set(stejne).size, 1, `varianty se rozpadly na: ${[...new Set(stejne)].join(' | ')}`);
  assert.equal(stejne[0], 'kuře s bramborem');
});

test('jiné jídlo zůstane jiné', () => {
  const a = zakladNazvuJidla('Kuře s bramborem — porce 150/250');
  assert.notEqual(a, zakladNazvuJidla('Kuře s batátem — porce 150/250'));
  assert.notEqual(a, zakladNazvuJidla('Krůta s bramborem — porce 150/250'));
  assert.notEqual(a, zakladNazvuJidla('Kuře s rýží'));
});

test('pomlčka uvnitř názvu se nesmí brát jako oddělovač porce', () => {
  // Dělí se jen pomlčka obklopená mezerami — jinak by z „Kuře-kari“ zbylo „kuře“
  // a splynulo by s jiným jídlem.
  assert.equal(zakladNazvuJidla('Kuře-kari s rýží'), 'kuře-kari s rýží');
});

test('závorky a přebytečné mezery základ nerozhodí', () => {
  assert.equal(zakladNazvuJidla('Ovesná kaše  (bez cukru)'), 'ovesná kaše');
  assert.equal(zakladNazvuJidla('  Tuňák s pečivem  '), 'tuňák s pečivem');
});

test('prázdný název nevyrobí klíč, který by omylem blokoval jídla', () => {
  for (const v of [null, undefined, '', '   ']) assert.equal(zakladNazvuJidla(v), '');
  // A prázdný klíč se nesmí dostat mezi zakázané základy.
  assert.equal(vycerpaneZaklady(new Map([['', 5]])).size, 0);
});

test('základ se blokuje až od druhého použití', () => {
  const out = vycerpaneZaklady(new Map([
    ['kuře s bramborem', 2],
    ['omeleta se zeleninou', 1],
  ]));
  assert.equal(out.has('kuře s bramborem'), true, 'dvě porce téhož jídla stačí');
  assert.equal(out.has('omeleta se zeleninou'), false);
});
