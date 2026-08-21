/**
 * PŘECENĚNÍ NESMÍ OSIŘET STÁVAJÍCÍ PŘEDPLATITELE.
 *
 * PROČ TENHLE TEST EXISTUJE
 * 12. 8. 2026 ve 23:33 skončily dvě měsíční obnovy jako `skipped_unknown_price`.
 * Neznámá cena byla `price_1T7jKNPTu5plCL9PSTfT8St1` — archivovaný START za
 * 499 Kč. Aktuální START je `price_1Tsq2DPTu5plCL9PhNU0S7hL` za 599 Kč a
 * mapování tehdy sneslo jednu cenu na tier, takže přeceněním 499 → 599 staré
 * price ID z mapy vypadlo. Webhook přestal poznávat tier u všech, kdo na staré
 * ceně zůstali, a Stripe události o nich zahazoval s HTTP 200.
 *
 * Reálná price ID níž jsou schválně — tenhle test má chytit přesně ten případ,
 * ne jeho abstraktní tvar. Při přechodu do ostrého režimu vzniknou nová ID
 * a stejná past čeká znovu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStripePriceIds,
  buildStripePriceToTierMap,
  resolveTierFromStripePriceId,
  resolveTierFromStripeSubscription,
  getStripePriceIdForTier,
  stripeTierEnvStatus,
} from '../stripeTierMapping.js';

const START_599 = 'price_1Tsq2DPTu5plCL9PhNU0S7hL'; // aktualni
const START_499 = 'price_1T7jKNPTu5plCL9PSTfT8St1'; // archivovana, porad na ni bezi predplatne
const ON_CLUB = 'price_1TssdQPTu5plCL9PKbAc6Obc';

test('jedna cena v env funguje dál (zpětná kompatibilita)', () => {
  const env = { STRIPE_PRICE_START_MONTHLY: START_599 };
  assert.equal(resolveTierFromStripePriceId(START_599, env), 'START');
  assert.equal(getStripePriceIdForTier('START', env), START_599);
  assert.deepEqual(buildStripePriceToTierMap(env), { [START_599]: 'START' });
});

test('produkční případ z 12. 8. 2026: archivovaná cena se pozná jako START', () => {
  const env = { STRIPE_PRICE_START_MONTHLY: `${START_599},${START_499}` };

  // Tohle byl ten dvakrát zahozený webhook.
  assert.equal(resolveTierFromStripePriceId(START_499, env), 'START',
    'archivovaná cena 499 Kč musí mapovat na START, jinak se členství neaktivuje');
  assert.equal(resolveTierFromStripePriceId(START_599, env), 'START');
});

test('nový checkout jede na kanonickou cenu, ne na historickou', () => {
  const env = { STRIPE_PRICE_START_MONTHLY: `${START_599},${START_499}` };
  assert.equal(getStripePriceIdForTier('START', env), START_599,
    'kanonická je první v seznamu — nikdo nesmí nově koupit za starou cenu');
});

test('tier se pozná i ze subscription objektu na historické ceně', () => {
  const env = { STRIPE_PRICE_START_MONTHLY: `${START_599},${START_499}` };
  const sub = { items: { data: [{ price: { id: START_499 } }] } };
  assert.equal(resolveTierFromStripeSubscription(sub, env), 'START');

  // Starší tvar payloadu má plan.id místo price.id.
  const subPlan = { items: { data: [{ plan: { id: START_499 } }] } };
  assert.equal(resolveTierFromStripeSubscription(subPlan, env), 'START');
});

test('oddělovač snese čárku, středník i nový řádek', () => {
  assert.deepEqual(parseStripePriceIds(`${START_599}, ${START_499}`), [START_599, START_499]);
  assert.deepEqual(parseStripePriceIds(`${START_599};${START_499}`), [START_599, START_499]);
  assert.deepEqual(parseStripePriceIds(`${START_599}\n${START_499}`), [START_599, START_499]);
  assert.deepEqual(parseStripePriceIds('  '), []);
  assert.deepEqual(parseStripePriceIds(undefined), []);
});

test('neznámá cena zůstává neznámá — mapa se nesmí rozšířit na cokoli', () => {
  const env = { STRIPE_PRICE_START_MONTHLY: START_599 };
  assert.equal(resolveTierFromStripePriceId(START_499, env), null);
  assert.equal(resolveTierFromStripePriceId('price_neexistuje', env), null);
  assert.equal(resolveTierFromStripePriceId('', env), null);
  assert.equal(resolveTierFromStripePriceId(null, env), null);
});

test('env status hlásí historické ceny i chybějící tiery', () => {
  const env = {
    STRIPE_PRICE_START_MONTHLY: `${START_599},${START_499}`,
    STRIPE_PRICE_ON_CLUB_MONTHLY: ON_CLUB,
  };
  const status = stripeTierEnvStatus(env);

  assert.deepEqual(status.configured, ['START', 'ON_CLUB']);
  assert.deepEqual(status.missing, ['STRIPE_PRICE_VIP_MONTHLY']);
  assert.deepEqual(status.historicke, { START: [START_499] });
  assert.deepEqual(status.konflikty, []);
});

test('totéž price ID u dvou tierů se ohlásí jako konflikt, ne tiše přepíše', () => {
  const env = {
    STRIPE_PRICE_START_MONTHLY: START_599,
    STRIPE_PRICE_ON_CLUB_MONTHLY: START_599,
  };
  const status = stripeTierEnvStatus(env);

  assert.equal(status.konflikty.length, 1, 'konflikt musí být vidět');
  // Přiřazení zůstává deterministické podle pořadí tierů, ne podle náhody.
  assert.equal(resolveTierFromStripePriceId(START_599, env), 'START');
});
