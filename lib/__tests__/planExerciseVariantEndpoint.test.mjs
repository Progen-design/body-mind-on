/**
 * api/plan/exercise-variant.js — vlastnictví plánu a chybové odpovědi.
 *
 * Handler mluví přímo se Supabase (auth + ai_generated_plans) — end-to-end
 * test by potřeboval buď reálnou DB, nebo mock celého klienta. Tenhle
 * repozitář na to má zavedený vzor (viz lib/__tests__/postupCviku.test.mjs
 * "cron: fronty se STŘÍDAJÍ..."): ověřit TVAR zdroje pro věci, které se
 * jinak testují jen integračně. Konkrétně: řádek plánu se čte s
 * `.eq('user_id', user.id)` PŘÍMO ve stejném dotazu jako `.eq('id', ...)` —
 * cizí plán tak nikdy nepřijde zpátky (ne až následná kontrola v JS), a
 * `!planRow` končí 404, ne 200 s cizími daty.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const zdroj = readFileSync(
  join(import.meta.dirname, '..', '..', 'api', 'plan', 'exercise-variant.js'),
  'utf8'
);

test('vyžaduje Bearer token a ověřenou session před čímkoli jiným', () => {
  assert.match(zdroj, /auth\.startsWith\('Bearer '\)/);
  assert.match(zdroj, /supabaseServer\.auth\.getUser\(token\)/);
  assert.match(zdroj, /if \(userErr \|\| !user\)/);
});

test('plán se čte s .eq(\'id\', ...) A .eq(\'user_id\', user.id) ve stejném dotazu — cizí plán nikdy nepřijde zpátky', () => {
  const idx = zdroj.indexOf("from('ai_generated_plans')");
  assert.ok(idx > -1, 'chybí dotaz na ai_generated_plans');
  const usek = zdroj.slice(idx, zdroj.indexOf('maybeSingle()', idx));
  assert.match(usek, /\.eq\('id', planId\)/);
  assert.match(usek, /\.eq\('user_id', user\.id\)/);
});

test('chybějící řádek (cizí nebo neexistující plán) končí 404, ne 200', () => {
  const idx = zdroj.indexOf('if (!planRow)');
  assert.ok(idx > -1);
  const usek = zdroj.slice(idx, idx + 120);
  assert.match(usek, /res\.status\(404\)/);
});

test('UPDATE je taky omezený na vlastníka — obrana do hloubky, ne jen SELECT', () => {
  const idx = zdroj.indexOf(".update({\n        structured_plan_json");
  assert.ok(idx > -1, 'update blok nenalezen');
  const usek = zdroj.slice(idx, idx + 300);
  assert.match(usek, /\.eq\('id', planId\)/);
  assert.match(usek, /\.eq\('user_id', user\.id\)/);
});

test('Supabase chyby ({ error }) se kontrolují explicitně, ne jen try/catch — u čtení plánu, body_metrics i update', () => {
  assert.match(zdroj, /const \{ data: planRow, error: planErr \}/);
  assert.match(zdroj, /if \(planErr\) \{/);
  assert.match(zdroj, /const \{ data: bmRows, error: bmErr \}/);
  assert.match(zdroj, /if \(bmErr\) \{/);
  assert.match(zdroj, /const \{ error: updateErr \}/);
  assert.match(zdroj, /if \(updateErr\) \{/);
});

test('chybové hlášky jsou česky srozumitelné, ne jen error kódy', () => {
  assert.match(zdroj, /Nejste přihlášen/);
  assert.match(zdroj, /Plán nenalezen/);
  assert.match(zdroj, /lehčí\/těžší variantu nemáme/);
});
