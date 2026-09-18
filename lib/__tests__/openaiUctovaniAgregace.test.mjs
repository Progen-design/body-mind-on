// PROMPT_NAKLADY_AI_DODATEK.md (2026-09-18) — `scripts/audit-unit-economics.mjs`
// sčítalo `ai_runs.cost_usd` přes VŠECHNY purposy, včetně `recipe_generator_beh`
// (souhrnný řádek za běh generátoru, cenu už nesou jednotlivé řádky
// `recipe_generation`). Report tak hlásil $32,05 za 30 dní místo skutečných
// $19,04 — 68 % nadhodnocení, přesně ten dvojí součet, který
// `openai_daily_usage` (migrace 20260828100000) už řešila filtrem, jen ne
// mimo tu jednu SQL definici. Test pinuje `sectiCenuBezAgregaci()` —
// SDÍLENOU logiku, kterou report i cokoli dalšího, co sčítá `ai_runs.cost_usd`,
// má použít, aby na filtr nešlo znovu zapomenout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AGREGACNI_PURPOSY, jeAgregacniPurpose, sectiCenuBezAgregaci } from '../openai.js';

test('AGREGACNI_PURPOSY obsahuje recipe_generator_beh a recipe_generation_vysledek', () => {
  assert.ok(AGREGACNI_PURPOSY.includes('recipe_generator_beh'));
  assert.ok(AGREGACNI_PURPOSY.includes('recipe_generation_vysledek'));
});

test('jeAgregacniPurpose pozná agregační i skutečný purpose', () => {
  assert.equal(jeAgregacniPurpose('recipe_generator_beh'), true);
  assert.equal(jeAgregacniPurpose('recipe_generation'), false);
  assert.equal(jeAgregacniPurpose(null), false);
  assert.equal(jeAgregacniPurpose(undefined), false);
});

test('sectiCenuBezAgregaci: fixture ze zadání — 2 recipe_generation + 1 recipe_generator_beh s cenou', () => {
  const radky = [
    { purpose: 'recipe_generation', cost_usd: 0.03, input_tokens: 7500, output_tokens: 690 },
    { purpose: 'recipe_generation', cost_usd: 0.02, input_tokens: 7500, output_tokens: 690 },
    // Souhrnný řádek za běh — nese starou (historickou) cenu celého běhu,
    // která je SOUČTEM/násobkem dávek výš, ne nová položka k připočtení.
    { purpose: 'recipe_generator_beh', cost_usd: 13.01, input_tokens: 0, output_tokens: 0 },
  ];

  const vysledek = sectiCenuBezAgregaci(radky);

  // Součet je JEN z prvních dvou řádků — 13,01 se do celkové ceny nesmí
  // dostat, i když v datech je.
  assert.equal(vysledek.celkemUsd, 0.05);
  assert.equal(vysledek.pocetVyloucenychAgregacnich, 1);
  assert.equal(vysledek.pouziteRadky.length, 2);
  assert.deepEqual(
    vysledek.pouziteRadky.map((r) => r.purpose),
    ['recipe_generation', 'recipe_generation']
  );
});

test('sectiCenuBezAgregaci: prázdné pole a chybějící vstup nespadnou', () => {
  assert.equal(sectiCenuBezAgregaci([]).celkemUsd, 0);
  assert.equal(sectiCenuBezAgregaci(undefined).celkemUsd, 0);
  assert.equal(sectiCenuBezAgregaci(null).pocetVyloucenychAgregacnich, 0);
});

test('sectiCenuBezAgregaci: řádek bez cost_usd (null, jako nová diagnostika) se počítá jako 0, ne NaN', () => {
  const vysledek = sectiCenuBezAgregaci([
    { purpose: 'recipe_generation', cost_usd: 0.04, input_tokens: 100, output_tokens: 20 },
    { purpose: 'recipe_generator_beh', cost_usd: null, input_tokens: null, output_tokens: null },
  ]);
  assert.equal(vysledek.celkemUsd, 0.04);
  assert.equal(vysledek.pocetVyloucenychAgregacnich, 1);
});

test('sectiCenuBezAgregaci: sčítá i tokeny, jen z nepovažovaných řádků', () => {
  const vysledek = sectiCenuBezAgregaci([
    { purpose: 'preklad_receptu', cost_usd: 0.01, input_tokens: 200, output_tokens: 50 },
    { purpose: 'recipe_generation_vysledek', cost_usd: 0, input_tokens: 0, output_tokens: 0 },
  ]);
  assert.equal(vysledek.celkemVstupTokenu, 200);
  assert.equal(vysledek.celkemVystupTokenu, 50);
});
