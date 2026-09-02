/**
 * FRONTA SI SAMA ZADÁVÁ NESPLNITELNÝ CÍL BÍLKOVIN — docs/DALSI_KROK.md 8.5.
 *
 * Měřeno na produkci 2. 9. 2026 (docs/BMON_ZDROJE_RECEPTU_2026-09-02.md,
 * bod 6): recepty s `{"podil": X}` nad 0,25 prakticky nikdy neprojdou
 * validací (0,30 → 3 %, 0,40+ → 0 %), a svačinové objednávky měly kalorické
 * pásmo užší, než co je pro slot použitelné (170–370 místo cíl/2..cíl×2).
 *
 * Testuje se přes fake klienta (stejný vzor jako recipeGeneratorDedup.test.mjs),
 * ne přes DB — ověřuje se, co se skutečně ZAPÍŠE do `recipe_generation_queue`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  objednejRecepty,
  objednejZNevyresenehoSlotu,
  objednejZeSlotuPodCilem,
  PRIORITA,
} from '../recipeGenerationQueue.js';
import { MAX_PODIL_OBJEDNAVKY } from '../plan/proteinHint.js';

/** Fake klient, který ZACHYTÍ, co se skutečně vložilo do fronty. */
function fakeClientZachycujici() {
  let zachyceno = null;
  const client = {
    from() {
      return {
        insert(radek) {
          zachyceno = radek;
          return this;
        },
        select() { return this; },
        async maybeSingle() { return { data: { id: 1 }, error: null }; },
      };
    },
  };
  return { client, ziskejRadek: () => zachyceno };
}

// ------------------------------------------------- strop podílu bílkovin

test('objednejZNevyresenehoSlotu ořízne podíl 0,55 na strop 0,25', async () => {
  const { client, ziskejRadek } = fakeClientZachycujici();
  await objednejZNevyresenehoSlotu({
    mealType: 'svacina',
    dietTags: [],
    slotTargetKcal: 270,
    minPodilBilkovin: 0.55,
  }, client);
  assert.equal(ziskejRadek().protein_hint, `{"podil":${MAX_PODIL_OBJEDNAVKY}}`);
});

test('objednejZeSlotuPodCilem ořízne podíl stejně jako nevyřešený slot', async () => {
  const { client, ziskejRadek } = fakeClientZachycujici();
  await objednejZeSlotuPodCilem({
    mealType: 'svacina',
    dietTags: [],
    slotTargetKcal: 270,
    minPodilBilkovin: 0.4,
    minuti: 0.15,
  }, client);
  assert.equal(ziskejRadek().protein_hint, `{"podil":${MAX_PODIL_OBJEDNAVKY}}`);
});

test('podíl pod stropem (0,20) projde beze změny', async () => {
  const { client, ziskejRadek } = fakeClientZachycujici();
  await objednejZNevyresenehoSlotu({
    mealType: 'svacina',
    dietTags: [],
    slotTargetKcal: 270,
    minPodilBilkovin: 0.2,
  }, client);
  assert.equal(ziskejRadek().protein_hint, '{"podil":0.2}');
});

test('bez podílu se nezadá žádný — surovinové hinty tímhle nejsou dotčené', async () => {
  const { client, ziskejRadek } = fakeClientZachycujici();
  await objednejZNevyresenehoSlotu({
    mealType: 'svacina',
    dietTags: [],
    slotTargetKcal: 270,
    minPodilBilkovin: null,
  }, client);
  assert.equal(ziskejRadek().protein_hint, null);
});

// ------------------------------------------------- rozšíření kcal pásma

test('objednejZNevyresenehoSlotu rozšíří pásmo podle cíle slotu (reálný případ 8.5)', async () => {
  const { client, ziskejRadek } = fakeClientZachycujici();
  await objednejZNevyresenehoSlotu({
    mealType: 'svacina',
    dietTags: [],
    slotTargetKcal: 369,
    minPodilBilkovin: null,
  }, client);
  const radek = ziskejRadek();
  assert.equal(radek.kcal_min, 170);
  assert.ok(radek.kcal_max >= 738, `kcal_max ${radek.kcal_max} musí pustit 380kcal recept i cíl×2`);
});

test('objednejZeSlotuPodCilem rozšíří pásmo stejnou cestou', async () => {
  const { client, ziskejRadek } = fakeClientZachycujici();
  await objednejZeSlotuPodCilem({
    mealType: 'svacina',
    dietTags: [],
    slotTargetKcal: 306,
    minPodilBilkovin: null,
    minuti: 0.1,
  }, client);
  const radek = ziskejRadek();
  assert.ok(radek.kcal_min <= 125, `kcal_min ${radek.kcal_min} musí pustit 125kcal recept z produkce`);
  assert.ok(radek.kcal_max >= 612);
});

test('bez cíle slotu (neznámý stav) spadne na kanonické pásmo, ne na chybu', async () => {
  const { client, ziskejRadek } = fakeClientZachycujici();
  await objednejZNevyresenehoSlotu({
    mealType: 'svacina',
    dietTags: [],
    slotTargetKcal: null,
    minPodilBilkovin: null,
  }, client);
  const radek = ziskejRadek();
  assert.equal(radek.kcal_min, 170);
  assert.equal(radek.kcal_max, 370);
});

// ------------------------------------------- SEED objednávky se nemění

test('seed objednávka rozšíření kcal pásma nedostane, i kdyby cilSlotu poslala', async () => {
  // Rozšíření je vyhrazené pro zdroj 'demand' — seed dál dostává kanonické
  // pásmo podle toho, co model typicky vyrobí (beze změny od 25. 8. 2026).
  const { client, ziskejRadek } = fakeClientZachycujici();
  await objednejRecepty({
    meal_type: 'svacina',
    diet_tags: [],
    kcal_min: 170,
    kcal_max: 370,
    cilSlotu: 369, // i kdyby nějaký budoucí seed caller tohle omylem poslal
    pozadovano: 5,
    priorita: PRIORITA.SEED,
    zdroj: 'seed',
  }, client);
  const radek = ziskejRadek();
  assert.equal(radek.kcal_min, 170);
  assert.equal(radek.kcal_max, 370, 'seed pásmo se nesmí rozšířit přes cilSlotu');
});

test('seed objednávka podíl bílkovin taky ořízne — strop je vlastnost modelu, ne zdroje', async () => {
  const { client, ziskejRadek } = fakeClientZachycujici();
  await objednejRecepty({
    meal_type: 'obed',
    diet_tags: [],
    kcal_min: 450,
    kcal_max: 680,
    pozadovano: 5,
    priorita: PRIORITA.SEED,
    zdroj: 'seed',
    min_podil_bilkovin: 0.5,
  }, client);
  assert.equal(ziskejRadek().protein_hint, `{"podil":${MAX_PODIL_OBJEDNAVKY}}`);
});
