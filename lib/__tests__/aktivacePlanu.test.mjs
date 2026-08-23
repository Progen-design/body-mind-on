/**
 * `is_active` U PLÁNU SE SROVNÁVÁ PODLE DATA, NE PODLE POŘADÍ GENEROVÁNÍ.
 *
 * Chyba, kterou to opravuje: každý generátor vypnul všechny plány uživatele
 * a nový vložil jako aktivní. Plán vygenerovaný dopředu tím vypnul ten,
 * který právě běžel, a nikdo ho zpátky nezapnul — původní
 * `deactivate_expired_plans` uměla jen vypínat po `valid_until`.
 *
 * Změřeno na produkci 23. 8. 2026 (neděle): `is_active = true` měl plán
 * s platností 27. 8. – 2. 9., zatímco plán na probíhající týden
 * (20. – 26. 8.) byl vypnutý.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CRON = readFileSync(
  new URL('../../api/cron/sweep-catalog-activation.js', import.meta.url),
  'utf8'
);
const MIGRACE = readFileSync(
  new URL('../../supabase/migrations/20260823200000_sync_plan_activation.sql', import.meta.url),
  'utf8'
);
const VERCEL = JSON.parse(
  readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')
);

test('cron volá srovnání příznaku, ne jen deaktivaci propadlých', () => {
  assert.ok(
    CRON.includes("rpc('sync_plan_activation')"),
    'cron nevolá sync_plan_activation'
  );
  assert.ok(
    !CRON.includes("rpc('deactivate_expired_plans')"),
    'cron zase volá jen deaktivaci — vypnutý běžící plán se nezapne zpátky'
  );
});

test('funkce umí příznak i zapnout, nejen vypnout', () => {
  assert.ok(/set is_active = true/i.test(MIGRACE), 'chybí zapnutí plánu, který platí dnes');
  assert.ok(/set is_active = false/i.test(MIGRACE), 'chybí vypnutí ostatních');
});

test('o platnosti rozhoduje rozsah, ne jen konec', () => {
  assert.ok(
    /current_date between valid_from and valid_until/i.test(MIGRACE),
    'funkce se neptá na valid_from — budoucí plán zase projde jako aktivní'
  );
});

test('při překryvu vyhraje jeden plán na uživatele', () => {
  // Bez `distinct on` by mohly zustat aktivni dva a UI by si vybralo nahodne.
  assert.ok(/distinct on \(user_id\)/i.test(MIGRACE), 'chybí omezení na jeden plán na uživatele');
});

test('sweep běží hned po půlnoci pražského času', () => {
  // Platnost se lame o pulnoci. Kdyz cron jede az rano, je priznak
  // kazdy den prvnich par hodin pozadu.
  const zaznam = (VERCEL.crons || []).find(
    (c) => c.path === '/api/cron/sweep-catalog-activation'
  );
  assert.ok(zaznam, 'sweep není ve vercel.json');

  const [minuta, hodina] = String(zaznam.schedule).split(' ');
  const hodinaUtc = Number(hodina);
  assert.ok(Number.isFinite(hodinaUtc), `nečitelná hodina: ${zaznam.schedule}`);

  // Praha je UTC+1 v zime a UTC+2 v lete; 22:00 nebo 23:00 UTC padne
  // tesne za pulnoc obojim smerem.
  assert.ok(
    hodinaUtc === 22 || hodinaUtc === 23,
    `sweep běží v ${hodina}:${minuta} UTC, což v Praze není hned po půlnoci`
  );
});
