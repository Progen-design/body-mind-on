/**
 * Záložky profilu z návrhu v4 — logika pod lištou.
 *
 * Návrh měl u záložky „Regenerace & Apple Watch“ napevno napsaný odznak `'70'`
 * přímo v poli `tabs`. U člověka, který hodinky nepřipojil, by to vypadalo jako
 * naměřené skóre. Testy hlídají hlavně tohle: že odznak vzniká jen ze
 * skutečných dat a že chybějící měření není nula.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ZALOZKY, odznakZalozky, skoreRegenerace } from '../profile/profilZalozky.js';

test('každá záložka míří na sekci i kotvu', () => {
  assert.equal(ZALOZKY.length, 6);
  for (const z of ZALOZKY) {
    assert.ok(z.id, 'záložka bez id');
    assert.ok(z.popisek, `záložka ${z.id} bez popisku`);
    assert.ok(z.sekce, `záložka ${z.id} bez sekce`);
    assert.ok(z.kotva, `záložka ${z.id} bez kotvy`);
  }
});

test('id záložek jsou jedinečná', () => {
  const ids = ZALOZKY.map((z) => z.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('skóre regenerace bez dat je null, ne nula', () => {
  assert.equal(skoreRegenerace([]), null);
  assert.equal(skoreRegenerace(null), null);
  assert.equal(skoreRegenerace(undefined), null);
  assert.equal(skoreRegenerace([{ recovery_score: null }]), null);
  assert.equal(skoreRegenerace([{}]), null);
});

test('skóre regenerace se bere z nejnovějšího řádku', () => {
  const radky = [{ recovery_score: 62 }, { recovery_score: 41 }];
  assert.equal(skoreRegenerace(radky), 62);
});

test('nula je platné skóre a nesmí spadnout na null', () => {
  assert.equal(skoreRegenerace([{ recovery_score: 0 }]), 0);
});

test('odznak regenerace bez hodinek nevznikne — a rozhodně ne „70“', () => {
  assert.equal(odznakZalozky('regenerace', { radkyRegenerace: [] }), null);
  assert.equal(odznakZalozky('regenerace', {}), null);
});

test('odznak regenerace ukazuje skutečné skóre', () => {
  assert.equal(odznakZalozky('regenerace', { radkyRegenerace: [{ recovery_score: 62 }] }), '62');
  assert.equal(odznakZalozky('regenerace', { radkyRegenerace: [{ recovery_score: 48.6 }] }), '49');
});

test('odznak návyků ukazuje jen nesplněné, a jen když nějaké zbývají', () => {
  assert.equal(odznakZalozky('navyky', { nesplnenoDnes: 3 }), '3');
  assert.equal(odznakZalozky('navyky', { nesplnenoDnes: 0 }), null);
  assert.equal(odznakZalozky('navyky', { nesplnenoDnes: null }), null);
  assert.equal(odznakZalozky('navyky', {}), null);
});

test('ostatní záložky odznak nemají', () => {
  for (const id of ['dnes', 'jidelnicek', 'trenink', 'nakup']) {
    assert.equal(odznakZalozky(id, { radkyRegenerace: [{ recovery_score: 62 }], nesplnenoDnes: 3 }), null);
  }
});
