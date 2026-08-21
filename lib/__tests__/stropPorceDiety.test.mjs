/**
 * Širší strop porce pro restriktivní diety (rozhodnuto 19. 8. 2026).
 *
 * Po opravě validace (#88) prošlo START knihovnou 9 gluten_free snídaní a 5
 * obědů, ale strop 0,85–1,15 z nich nechal 3 a 1 — uživatel dostal třikrát
 * tutéž snídani. Pro profily s dietou se proto povoluje 0,75–1,30; bez diety
 * zůstává 0,85–1,15 beze změny.
 *
 * Testy hlídají hlavně to druhé: rozvolnění se NESMÍ přelít na profil bez diety
 * ani mimo START.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SCALE,
  MIN_SCALE,
  START_MAX_SCALE,
  START_MAX_SCALE_DIETA,
  START_MIN_SCALE,
  START_MIN_SCALE_DIETA,
  clampedPortionMultiplier,
} from '../nutrition/portionScaling.js';
import { maRestriktivniDietu } from '../dietaryRules.js';

test('restriktivní diety jsou vyjmenované a standard mezi ně nepatří', () => {
  for (const d of ['gluten_free', 'lactose_free', 'low_carb', 'vegetarian']) {
    assert.equal(maRestriktivniDietu({ diet_type: d }), true, d);
  }
  for (const d of ['standard', '', null, undefined, 'nesmysl']) {
    assert.equal(maRestriktivniDietu({ diet_type: d }), false, String(d));
  }
  assert.equal(maRestriktivniDietu(null), false);
});

test('pomlčkové varianty se poznají taky', () => {
  assert.equal(maRestriktivniDietu({ diet_type: 'gluten-free' }), true);
  assert.equal(maRestriktivniDietu({ diet_type: 'low-carb' }), true);
  assert.equal(maRestriktivniDietu({ diet_type: 'GLUTEN_FREE' }), true);
});

test('profil je zdroj pravdy, argument ho nepřebije hodnotou „standard“', () => {
  assert.equal(maRestriktivniDietu({ diet_type: 'gluten_free' }, 'standard'), true);
  assert.equal(maRestriktivniDietu({}, 'low_carb'), true, 'bez profilu se smí použít argument');
});

test('meze stropu jsou takové, jak bylo rozhodnuto', () => {
  assert.equal(START_MIN_SCALE, 0.85);
  assert.equal(START_MAX_SCALE, 1.15);
  assert.equal(START_MIN_SCALE_DIETA, 0.75);
  assert.equal(START_MAX_SCALE_DIETA, 1.30);
});

test('START s dietou povolí větší posun porce', () => {
  // Recept 600 kcal na slot 800 kcal: bez diety se utne na 1,15, s dietou na 1,30.
  const bezDiety = clampedPortionMultiplier(600, 800, { simpleStartMode: true });
  const sDietou = clampedPortionMultiplier(600, 800, { simpleStartMode: true, restrictiveDiet: true });
  assert.equal(bezDiety, 1.15);
  assert.equal(sDietou, 1.3);

  // A stejně dolů: 600 kcal na slot 400.
  assert.equal(clampedPortionMultiplier(600, 400, { simpleStartMode: true }), 0.85);
  assert.equal(clampedPortionMultiplier(600, 400, { simpleStartMode: true, restrictiveDiet: true }), 0.75);
});

test('profil BEZ diety zůstává na 0,85–1,15 — to se měnit nemělo', () => {
  for (const cil of [200, 400, 800, 2000]) {
    const n = clampedPortionMultiplier(600, cil, { simpleStartMode: true });
    assert.ok(n >= START_MIN_SCALE && n <= START_MAX_SCALE, `${cil} → ${n}`);
  }
});

test('mimo START nemá dieta na strop vliv — tam se škáluje 0,5–2,0 vždy', () => {
  const bez = clampedPortionMultiplier(600, 2000, {});
  const s = clampedPortionMultiplier(600, 2000, { restrictiveDiet: true });
  assert.equal(bez, MAX_SCALE);
  assert.equal(s, MAX_SCALE, 'restrictiveDiet nesmí rozšířit už tak široký strop');
  assert.equal(clampedPortionMultiplier(600, 100, { restrictiveDiet: true }), MIN_SCALE);
});

test('když se cíl trefí, škáluje se 1 bez ohledu na dietu', () => {
  assert.equal(clampedPortionMultiplier(500, 500, { simpleStartMode: true }), 1);
  assert.equal(clampedPortionMultiplier(500, 500, { simpleStartMode: true, restrictiveDiet: true }), 1);
});

test('nesmyslný vstup nevyrobí nesmyslný násobek', () => {
  for (const base of [0, -10, null, undefined, NaN]) {
    assert.equal(clampedPortionMultiplier(base, 500, { simpleStartMode: true, restrictiveDiet: true }), 1);
  }
});
