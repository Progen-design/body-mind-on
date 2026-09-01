/**
 * UDÁLOST `target_changed` SE MÁ ZALOŽIT PRÁVĚ JEDNOU NA SKUTEČNOU ZMĚNU CÍLE.
 *
 * docs/DALSI_KROK.md 8.1. `body_metrics.calories_target` se dnes mění na
 * pěti místech (lib/updateHeightCm.js, api/profile-body-data.js,
 * api/profile-preferences.js, lib/unifiedPlanPipeline.js přes
 * `syncBodyMetricsCalorieTarget`, a lib/weeklyWeightRecalc.js — poslední
 * jmenované mimo `buildCalorieTargetBodyMetricsPatch()`). Kdyby si každé
 * z nich stavělo `ai_events` řádek samo, událost by vznikala pětkrát jinak,
 * nebo by na některém místě chyběla úplně. `buildTargetChangedPayload()`
 * je proto jediné místo, které smí rozhodnout „tohle je opravdu změna".
 *
 * Čistá funkce (žádná DB) — `emitCalorieTargetChangedEvent()` na ni jen
 * navazuje `enqueueAIEvent()`, což bez Supabase testovat nejde (stejné
 * omezení jako u ostatních `api/*`/`lib/*` míst v tomhle repu).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTargetChangedPayload } from '../calorieTargetIntegrity.js';

const ctu = (relPath) => fs.readFileSync(new URL(relPath, import.meta.url), 'utf8');

const PATCH = { calories_target: 2634, protein_target_g: 189, carbs_target_g: 285, fat_target_g: 82 };

test('skutečná změna cíle vyrobí payload se starou i novou hodnotou', () => {
  const payload = buildTargetChangedPayload({
    oldCaloriesTarget: 2164,
    patch: PATCH,
    source: 'height_updated',
  });
  assert.deepStrictEqual(payload, {
    old_calories_target: 2164,
    new_calories_target: 2634,
    source: 'height_updated',
    protein_target_g: 189,
    carbs_target_g: 285,
    fat_target_g: 82,
  });
});

test('stejná hodnota před i po se nepovažuje za změnu', () => {
  const payload = buildTargetChangedPayload({
    oldCaloriesTarget: 2634,
    patch: { calories_target: 2634 },
    source: 'weekly_recalc',
  });
  assert.equal(payload, null);
});

test('chybějící stará hodnota (registrace, ne změna) se nepovažuje za změnu', () => {
  const payload = buildTargetChangedPayload({
    oldCaloriesTarget: null,
    patch: PATCH,
    source: 'plan_pipeline_recalc',
  });
  assert.equal(payload, null);
});

test('null se nesmí přepočítat na 0 a projít jako "změna z nuly"', () => {
  // `Number(null) === 0` a `Number.isFinite(0) === true` — past, do které by
  // spadla naivní implementace nad `Number.isFinite(Number(x))`.
  for (const chybejici of [null, undefined, '', 0, -5]) {
    const payload = buildTargetChangedPayload({
      oldCaloriesTarget: chybejici,
      patch: PATCH,
      source: 'plan_pipeline_recalc',
    });
    assert.equal(payload, null, `oldCaloriesTarget=${JSON.stringify(chybejici)} nemělo projít jako změna`);
  }
});

test('patch bez calories_target (šlo jen o jiné pole) se nepovažuje za změnu', () => {
  const payload = buildTargetChangedPayload({
    oldCaloriesTarget: 2164,
    patch: { protein_target_g: 189 },
    source: 'preferences_updated',
  });
  assert.equal(payload, null);
});

test('desetinná/řetězcová stará hodnota z DB se zaokrouhlí, ne zahodí', () => {
  const payload = buildTargetChangedPayload({
    oldCaloriesTarget: '2163.6',
    patch: { calories_target: 2634 },
    source: 'weight_updated',
  });
  assert.equal(payload.old_calories_target, 2164);
});

test('chybějící makra v patchi jdou do payloadu jako null, ne undefined', () => {
  const payload = buildTargetChangedPayload({
    oldCaloriesTarget: 2000,
    patch: { calories_target: 2200 },
    source: 'weekly_recalc',
  });
  assert.deepStrictEqual(payload, {
    old_calories_target: 2000,
    new_calories_target: 2200,
    source: 'weekly_recalc',
    protein_target_g: null,
    carbs_target_g: null,
    fat_target_g: null,
  });
});

// ── Všech pět míst, kde se `calories_target` opravdu mění, musí volat
// `emitCalorieTargetChangedEvent` — jinak vznikne přesně to riziko z hlavičky
// tohohle souboru: událost na některém místě tiše chybí. DB volání odtud
// spustit nejde (stejné omezení jako u `regenerateMealsOnlyKeepsPlanId.test.mjs`),
// takže se kontroluje zdrojový text, ne běh.

test('lib/updateHeightCm.js volá emit po úspěšném zápisu výšky', () => {
  const src = ctu('../updateHeightCm.js');
  assert.match(src, /emitCalorieTargetChangedEvent/);
  assert.match(src, /source:\s*'height_updated'/);
});

test('api/profile-body-data.js volá emit po úspěšném zápisu váhy', () => {
  const src = ctu('../../api/profile-body-data.js');
  assert.match(src, /emitCalorieTargetChangedEvent/);
  assert.match(src, /source:\s*'weight_updated'/);
});

test('api/profile-preferences.js volá emit po úspěšném zápisu preferencí', () => {
  const src = ctu('../../api/profile-preferences.js');
  assert.match(src, /emitCalorieTargetChangedEvent/);
  assert.match(src, /source:\s*'preferences_updated'/);
});

test('lib/unifiedPlanPipeline.js volá emit uvnitř syncBodyMetricsCalorieTarget', () => {
  const src = ctu('../unifiedPlanPipeline.js');
  assert.match(src, /emitCalorieTargetChangedEvent/);
  assert.match(src, /source:\s*'plan_pipeline_recalc'/);
});

test('lib/weeklyWeightRecalc.js volá emit po týdenním přepočtu', () => {
  const src = ctu('../weeklyWeightRecalc.js');
  assert.match(src, /emitCalorieTargetChangedEvent/);
  assert.match(src, /source:\s*'weekly_recalc'/);
});

// ── Migrace (soubor, NEAPLIKOVANÝ v týhle session — docs/DALSI_KROK.md
// hlavička). Testuje se jen text, ne běh proti DB.

test('migrace 8.1 nechává obě pravidla vypnutá a INSERT dělá idempotentně', () => {
  const sql = ctu('../../supabase/migrations/20260901090000_target_changed_trigger_rules.sql');
  const inserty = sql.match(/INSERT INTO public\.ai_trigger_rules[\s\S]*?;/g) || [];
  assert.equal(inserty.length, 2, 'čekám přesně dva INSERTy — missing_plan a target_changed');
  for (const insert of inserty) {
    assert.match(insert, /WHERE NOT EXISTS/, 'INSERT bez ochrany by na produkci zdvojil existující řádek');
    assert.match(insert, /,\s*false\s*\n/, 'sloupec `enabled` musí být `false` — zapíná se ručně, ne migrací');
    assert.doesNotMatch(insert, /,\s*true\s*\n/, 'žádné pravidlo se v týhle migraci nesmí zapnout');
  }
  assert.match(sql, /'target_changed',\s*'adjust_plan'/);
  assert.match(sql, /'missing_plan',\s*'initial_plan'/);
});
