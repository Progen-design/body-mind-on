/**
 * VÝBĚR PLÁNU SE ŘÍDÍ DATEM PLATNOSTI, NE JEN PŘÍZNAKEM `is_active`.
 *
 * Chyba, kterou to opravuje: podmínka se ptala jen na `valid_until >= dnes`
 * a `valid_from` ignorovala. Plán vygenerovaný dopředu na příští týden tím
 * prošel jako aktivní, protože jeho konec je v budoucnu.
 *
 * Změřeno na produkci 23. 8. 2026 (neděle): `is_active = true` měl plán
 * s platností 27. 8. – 2. 9., zatímco plán na probíhající týden
 * (20. – 26. 8.) měl `is_active = false`. Uživateli se v neděli ukazoval
 * „nejbližší trénink (pátek)" z týdne, který ještě nezačal.
 *
 * Test čte zdroj, protože `vyberPlan` je v TypeScriptu a tahle sada běží
 * bez transpilace.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ZDROJ = readFileSync(new URL('../../src/data/adaptery.ts', import.meta.url), 'utf8');

/** Tělo `vyberPlan` bez komentářů — ty popisují historii. */
const VYBER = (() => {
  const od = ZDROJ.indexOf('export function vyberPlan');
  const do_ = ZDROJ.indexOf('export function platnostPlanu');
  assert.ok(od > 0 && do_ > od, 'vyberPlan se v adaptéru nenašel');
  return ZDROJ.slice(od, do_)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((r) => !r.trim().startsWith('//'))
    .join('\n');
})();

test('výběr plánu se ptá na začátek platnosti, ne jen na konec', () => {
  assert.ok(
    /valid_from/.test(VYBER),
    'vyberPlan se neptá na valid_from — budoucí plán zase projde jako aktivní'
  );
  assert.ok(/valid_until/.test(VYBER), 'vyberPlan se neptá na valid_until');
});

test('`is_active` sám o sobě o výběru nerozhoduje', () => {
  // Na produkci byl priznak na spatnem planu. Datum je spolehlivejsi.
  const jenPodleAktivni = /const aktivni = plans\.find\(\s*\(p\) => p\?\.is_active/.test(VYBER);
  assert.ok(!jenPodleAktivni, 'výběr se zase řídí jen příznakem is_active');
});

test('existuje způsob, jak poznat plán z jiného období', () => {
  // UI musi umet rict „tenhle plan jeste nezacal", jinak vydava trenink
  // z pristiho tydne za dnesni.
  assert.ok(
    /export function platnostPlanu/.test(ZDROJ),
    'chybí platnostPlanu — UI nepozná budoucí plán od aktuálního'
  );
  for (const stav of ['budouci', 'skoncil', 'aktualni']) {
    assert.ok(ZDROJ.includes(`'${stav}'`), `platnostPlanu nezná stav ${stav}`);
  }
});

test('zaměření tréninku se neskládá z názvu varianty', () => {
  const kod = ZDROJ
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((r) => !r.trim().startsWith('//'))
    .join('\n');
  assert.ok(
    !/focus:\s*w\?\.start_program_variant/.test(kod),
    'focus zase opisuje `Varianta X` místo svalových skupin'
  );
  assert.ok(/zamereniTreninku\(/.test(kod), 'focus se neskládá ze cviků');
});
