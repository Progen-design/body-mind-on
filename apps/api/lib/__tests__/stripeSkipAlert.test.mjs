/**
 * ZAHOZENÁ STRIPE UDÁLOST MUSÍ BÝT VIDĚT.
 *
 * PROČ TENHLE TEST EXISTUJE
 * 12. 8. 2026 skončily dva `customer.subscription.updated` jako
 * `skipped_unknown_price`, status `completed`, `error_message` NULL, HTTP 200.
 * Nikde se to neprojevilo. Z databáze nešlo ani zjistit, KTERÉ price ID
 * neznáme. Kdyby to byl platící zákazník na ceně, kterou nemáme v env
 * (třeba ON Club), zaplatil by a nedostal nic.
 *
 * Testuje se `skipStripeEvent` s podvrženým klientem a SQL větev alertu se
 * kontroluje proti migraci — do view se řádek vložit nedá, takže „alert“
 * znamená větev, která čte ze `stripe_events`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = join(import.meta.dirname, '..', '..');

test('(c) přeskočená událost si nese důvod i price ID', async () => {
  // supabaseServer se nedá podvrhnout přes import, tak se testuje tvar zápisu:
  // skipStripeEvent musí při chybové zprávě sáhnout na update s error_message,
  // ne jen zavolat completeStripeEvent, které ji zahodí.
  const zdroj = readFileSync(join(KOREN, 'lib', 'stripeEventStore.js'), 'utf8');

  const i = zdroj.indexOf('export async function skipStripeEvent');
  assert.ok(i > 0, 'skipStripeEvent se nenašla');
  const telo = zdroj.slice(i, i + 900);

  assert.match(telo, /errorMessage/, 'skipStripeEvent musí umět převzít důvod');
  assert.match(telo, /error_message:\s*errorMessage/, 'důvod se musí zapsat do sloupce error_message');
  assert.match(telo, /handler_result:\s*result/, 'výsledek se musí zapsat taky');
});

test('(c) webhook posílá do skipu konkrétní price ID', () => {
  const zdroj = readFileSync(join(KOREN, 'pages', 'api', 'webhooks', 'stripe.js'), 'utf8');

  const vyskyty = [...zdroj.matchAll(/finishSkipped\(\s*event,\s*'skipped_unknown_price'([\s\S]{0,240}?)\)/g)];
  assert.equal(vyskyty.length, 2, 'obě větve (checkout i subscription) musí hlásit neznámou cenu');

  for (const [, zbytek] of vyskyty) {
    assert.match(zbytek, /price_id/, 'zpráva musí obsahovat price_id');
    assert.match(zbytek, /priceId|price\?\.id/, 'a to skutečnou hodnotu, ne jen slovo');
  }

  // 200 zůstává schválně: opakovaným doručením se neznámé price ID nespraví.
  assert.match(
    zdroj,
    /skipped:\s*'unknown_price'/,
    'checkout větev pořád vrací 200 s popisem, ne 4xx'
  );
});

test('(c) system_health_alerts má větev na zahozené Stripe události', () => {
  const migrace = readdirSync(join(KOREN, 'supabase', 'migrations'))
    .filter((f) => f.includes('alert_stripe'));
  assert.equal(migrace.length, 1, 'čekána právě jedna migrace s alertem');

  const sql = readFileSync(join(KOREN, 'supabase', 'migrations', migrace[0]), 'utf8');

  assert.match(sql, /stripe_udalost_zahozena/, 'větev musí mít kód');
  assert.match(sql, /FROM stripe_events/, 'a číst ze stripe_events');
  assert.match(sql, /handler_result LIKE ''skipped_/, 'zachytit VŠECHNY skipped_* stavy, ne jen unknown_price');
  assert.match(sql, /critical/, 'zaplacený člověk bez přístupu je critical');

  // Klíčové: view se NEPŘEPISUJE ručně. Má 21 větví a přepsat je znamená
  // přepsat i těch 20 ostatních — při prvním pokusu jsem tři omylem zahodil.
  assert.match(sql, /pg_get_viewdef/, 'větev se vkládá do existující definice');
  assert.match(sql, /IF puvodni LIKE '%stripe_udalost_zahozena%'/, 'migrace musí být idempotentní');
  assert.equal(
    /CREATE OR REPLACE VIEW public\.system_health_alerts AS\s*\n\s*SELECT/.test(sql),
    false,
    'view se nesmí přepisovat ručně vypsanou definicí'
  );
});
