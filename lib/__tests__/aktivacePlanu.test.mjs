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
 *
 * DRUHÉ KOLO (8. 9. 2026): noční `sync_plan_activation()` výš je správně,
 * ale generátory plánu (`persistPlanFromUnified` v lib/unifiedPlanPipeline.js,
 * `persistTrainerPlan` a `persistPublishableFallbackPlanForUser` v
 * lib/taskExecutors.js) pořád vkládaly nový plán natvrdo s `is_active: true`
 * a natvrdo deaktivovaly VŠECHNO, co bylo aktivní — bez ohledu na to, jestli
 * nový plán vůbec dnešek pokrývá. `weekly_plan_update` vzniká
 * `WEEKLY_PRODUCER_LEAD_DAYS` (1) den před koncem platnosti aktuálního
 * plánu, takže se typicky generuje o den dřív, než nový plán začne platit
 * — a starý plán, který dnešek ještě pokrýval, tak zůstal bez náhrady až
 * do půlnočního sweepu. `jePlatnyDnes()` (lib/weeklyPlanProducer.js) je ta
 * oprava — použije se při INSERTu místo natvrdo `true`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jePlatnyDnes } from '../weeklyPlanProducer.js';

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
const UNIFIED_PIPELINE = readFileSync(
  new URL('../unifiedPlanPipeline.js', import.meta.url),
  'utf8'
).replace(/\r\n/g, '\n');
const TASK_EXECUTORS = readFileSync(
  new URL('../taskExecutors.js', import.meta.url),
  'utf8'
).replace(/\r\n/g, '\n');

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

// --- DRUHÉ KOLO (8. 9. 2026): jePlatnyDnes() při INSERTu -------------------

test('jePlatnyDnes: plán vygenerovaný 2 dny před valid_from má is_active === false', () => {
  // Přesně naměřený případ: nový plán 10.–16. 9., vygenerovaný (a natvrdo
  // aktivovaný) 8. 9. — o dva dny dřív, než začne platit.
  assert.equal(jePlatnyDnes('2026-09-10', '2026-09-16', '2026-09-08'), false);
});

test('jePlatnyDnes: starý plán pokrývající dnešek zůstane is_active === true', () => {
  // Plán 3.–9. 9., dnešek 8. 9. — pořád ve vlastním okně.
  assert.equal(jePlatnyDnes('2026-09-03', '2026-09-09', '2026-09-08'), true);
});

test('jePlatnyDnes: v den valid_from se nový stane aktivním a starý (skončil včera) ne', () => {
  assert.equal(jePlatnyDnes('2026-09-10', '2026-09-16', '2026-09-10'), true);
  assert.equal(jePlatnyDnes('2026-09-03', '2026-09-09', '2026-09-10'), false);
});

test('jePlatnyDnes: hranice platí včetně (valid_from i valid_until)', () => {
  assert.equal(jePlatnyDnes('2026-09-03', '2026-09-09', '2026-09-03'), true);
  assert.equal(jePlatnyDnes('2026-09-03', '2026-09-09', '2026-09-09'), true);
  assert.equal(jePlatnyDnes('2026-09-03', '2026-09-09', '2026-09-02'), false);
});

test('jePlatnyDnes: chybějící okno je vždy false, nespadne', () => {
  assert.equal(jePlatnyDnes(null, '2026-09-09'), false);
  assert.equal(jePlatnyDnes('2026-09-03', null), false);
  assert.doesNotThrow(() => jePlatnyDnes(undefined, undefined));
});

test('jePlatnyDnes: nikdy nejsou dva aktivní plány pro jednoho uživatele zároveň (sousední okna se v žádném dni nepřekrývají)', () => {
  const stary = { from: '2026-09-03', until: '2026-09-09' };
  const novy = { from: '2026-09-10', until: '2026-09-16' };
  const dny = [
    '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-05', '2026-09-08',
    '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-16', '2026-09-17', '2026-09-20',
  ];
  for (const dnes of dny) {
    const obaAktivni = jePlatnyDnes(stary.from, stary.until, dnes) && jePlatnyDnes(novy.from, novy.until, dnes);
    assert.equal(obaAktivni, false, `pro dnes=${dnes} nesmí být aktivní oba najednou`);
  }
});

// --- Zápisové cesty musí `jePlatnyDnes()` skutečně použít, ne jen mít -----
// funkci hotovou v knihovně. Přímé volání s reálným Supabase klientem se
// netestuje (funkce ho nedostávají injektovaný a tenhle soubor nesmí sahat
// na produkci) — ověřuje se to tvarem zdrojáku, jako u zbytku téhle sady.

test('persistPlanFromUnified (unifiedPlanPipeline.js) počítá is_active přes jePlatnyDnes, ne natvrdo true', () => {
  assert.match(UNIFIED_PIPELINE, /is_active:\s*jePlatnyDnes\(/);
  assert.doesNotMatch(
    UNIFIED_PIPELINE.replace(/is_active:\s*jePlatnyDnes\([^)]*\)/g, ''),
    /is_active:\s*true/,
    'nesmí zůstat žádné další natvrdo is_active: true mimo jePlatnyDnes()'
  );
});

test('persistPlanFromUnified deaktivuje jen plány, které dnešek přestaly pokrývat, ne všechno aktivní', () => {
  const blok = UNIFIED_PIPELINE.slice(
    UNIFIED_PIPELINE.indexOf('opts.deactivateOld'),
    UNIFIED_PIPELINE.indexOf('opts.deactivateOld') + 400
  );
  assert.match(blok, /\.eq\('is_active', true\)/);
  assert.match(blok, /\.or\(`valid_until\.lt\.\$\{dnes\},valid_from\.gt\.\$\{dnes\}`\)/);
});

test('persistTrainerPlan a persistPublishableFallbackPlanForUser (taskExecutors.js) používají jePlatnyDnes i date-aware deaktivaci', () => {
  const vyskytyFunkce = [...TASK_EXECUTORS.matchAll(/is_active:\s*jePlatnyDnes\(/g)];
  assert.ok(vyskytyFunkce.length >= 2, 'obě generující cesty musí počítat is_active přes jePlatnyDnes, ne natvrdo');

  const vyskytyOr = [...TASK_EXECUTORS.matchAll(/\.or\(`valid_until\.lt\.\$\{dnesProAktivaci\},valid_from\.gt\.\$\{dnesProAktivaci\}`\)/g)];
  assert.ok(vyskytyOr.length >= 2, 'deaktivace před zápisem musí být podmíněná datem na obou místech');
});

test('persistFallbackPlanForUser (interní artefakt, is_active vždy false) už nedeaktivuje uživatelův skutečný aktivní plán', () => {
  const zacatek = TASK_EXECUTORS.indexOf('deterministic_fallback_internal_only');
  assert.ok(zacatek > 0);
  const blok = TASK_EXECUTORS.slice(Math.max(0, zacatek - 600), zacatek);
  assert.doesNotMatch(
    blok,
    /\.update\(\{ is_active: false \}\)\.eq\('user_id', userId\)\.eq\('is_active', true\)/,
    'interní artefakt (vždy is_active:false) nesmí kvůli sobě deaktivovat žádný jiný plán'
  );
});
