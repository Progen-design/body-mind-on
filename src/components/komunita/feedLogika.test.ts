/**
 * Relativní čas ve feedu a seskupování bublin ve vlákně komunity.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { casRelativne, pripojStranku, seskupBubliny, sklonuj, MEZERA_SKUPINY_MS } from './feedLogika.ts';

/** Pevný „teď": 23. 9. 2026 14:00 v Praze (12:00 UTC). */
const TED = Date.parse('2026-09-23T12:00:00.000Z');
const MIN = 60_000;
const HOD = 60 * MIN;

function pred(ms: number): string {
  return new Date(TED - ms).toISOString();
}

// ---------------------------------------------------------------- čas

test('čas: pod minutu je „právě teď"', () => {
  assert.equal(casRelativne(pred(0), TED), 'právě teď');
  assert.equal(casRelativne(pred(59_000), TED), 'právě teď');
});

test('čas: budoucnost (hodiny jdou pozadu) je taky „právě teď"', () => {
  assert.equal(casRelativne(new Date(TED + 2 * MIN).toISOString(), TED), 'právě teď');
});

test('čas: minuty a hodiny v rámci dne', () => {
  assert.equal(casRelativne(pred(5 * MIN), TED), 'před 5 min');
  assert.equal(casRelativne(pred(59 * MIN), TED), 'před 59 min');
  assert.equal(casRelativne(pred(2 * HOD + 10 * MIN), TED), 'před 2 h');
});

test('čas: „včera" podle kalendáře v Praze, ne po 24 hodinách', () => {
  // 22. 9. 23:30 Praha je jen 14,5 h zpátky, ale je to včera.
  assert.equal(casRelativne('2026-09-22T21:30:00.000Z', TED), 'včera');
  // 23. 9. 00:30 Praha je dnes, i když je to 13,5 h.
  assert.equal(casRelativne('2026-09-22T22:30:00.000Z', TED), 'před 13 h');
});

test('čas: dny do týdne, pak datum', () => {
  assert.equal(casRelativne('2026-09-20T10:00:00.000Z', TED), 'před 3 dny');
  assert.equal(casRelativne('2026-09-10T10:00:00.000Z', TED), '10. 9.');
});

test('čas: jiný rok má rok v datu', () => {
  assert.equal(casRelativne('2025-12-30T10:00:00.000Z', TED), '30. 12. 2025');
});

test('čas: nesmysl je prázdný řetězec, ne „NaN"', () => {
  assert.equal(casRelativne(null, TED), '');
  assert.equal(casRelativne('nevim', TED), '');
});

test('skloňování: 1 dotaz, 3 dotazy, 5 dotazů, 0 dotazů', () => {
  const tvary: [string, string, string] = ['dotaz', 'dotazy', 'dotazů'];
  assert.equal(sklonuj(1, tvary), '1 dotaz');
  assert.equal(sklonuj(3, tvary), '3 dotazy');
  assert.equal(sklonuj(5, tvary), '5 dotazů');
  assert.equal(sklonuj(0, tvary), '0 dotazů');
});

// ---------------------------------------------------------------- bubliny

function zprava(id: string, user_id: string, minutaOd: number, extra: { is_team?: boolean } = {}) {
  return {
    id,
    user_id,
    author_name: user_id.toUpperCase(),
    created_at: new Date(TED + minutaOd * MIN).toISOString(),
    ...extra,
  };
}

test('bubliny: po sobě jdoucí zprávy téhož autora jsou jedna skupina', () => {
  const skupiny = seskupBubliny([
    zprava('1', 'eva', 0),
    zprava('2', 'eva', 1),
    zprava('3', 'jan', 2),
    zprava('4', 'eva', 3),
  ], 'ja');

  assert.deepEqual(skupiny.map((s) => s.zpravy.map((z) => z.id)), [['1', '2'], ['3'], ['4']]);
  assert.ok(skupiny.every((s) => s.strana === 'cizi'));
});

test('bubliny: vlastní vpravo, tým zvlášť, ostatní vlevo', () => {
  const skupiny = seskupBubliny([
    zprava('1', 'ja', 0),
    zprava('2', 'tym', 1, { is_team: true }),
    zprava('3', 'eva', 2),
  ], 'ja');

  assert.deepEqual(skupiny.map((s) => s.strana), ['moje', 'tym', 'cizi']);
});

test('bubliny: moderátor svou vlastní odpověď vidí jako „moje"', () => {
  const [skupina] = seskupBubliny([zprava('1', 'ja', 0, { is_team: true })], 'ja');
  assert.equal(skupina.strana, 'moje');
});

test('bubliny: dlouhá pauza založí novou skupinu i u stejného autora', () => {
  const pauza = MEZERA_SKUPINY_MS / MIN + 1;
  const skupiny = seskupBubliny([zprava('1', 'eva', 0), zprava('2', 'eva', pauza)], null);
  assert.equal(skupiny.length, 2);
});

test('bubliny: bez user_id se seskupuje podle jména', () => {
  const skupiny = seskupBubliny([
    { id: '1', author_name: 'Eva', created_at: pred(2 * MIN) },
    { id: '2', author_name: 'Eva', created_at: pred(MIN) },
    { id: '3', author_name: 'Jan', created_at: pred(0) },
  ], 'ja');
  assert.deepEqual(skupiny.map((s) => s.zpravy.length), [2, 1]);
});

test('bubliny: nepřihlášený (bez id) nemá žádnou „moje"', () => {
  const skupiny = seskupBubliny([zprava('1', 'eva', 0)], null);
  assert.equal(skupiny[0].strana, 'cizi');
});

// ---------------------------------------------------------------- stránky

test('stránkování: další stránka nepřidá příspěvek, který už máme', () => {
  const spojene = pripojStranku([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]);
  assert.deepEqual(spojene.map((p) => p.id), ['a', 'b', 'c']);
});
