/**
 * lib/translateQueueOrchestrator.js
 *
 * Kolotočové střídání dvou překladových front v api/cron/translate-recipes.js
 * (recepty / postupy cviků) — viz komentář v modulu pro úvahu, proč
 * kolotoč přes perzistovaný ukazatel, ne bezstavová alternativa.
 *
 * runRecipes/runExercises jsou tu vždy spy funkce (počítají volání) — díky
 * injekci jde strukturálně dokázat "nikdy obě v jednom běhu", ne se na to
 * jen spolehnout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vyberFrontuKPrekladu, provedJedenTahPrekladu } from '../translateQueueOrchestrator.js';

function spy(vratit) {
  const fn = async () => {
    fn.volani += 1;
    return vratit;
  };
  fn.volani = 0;
  return fn;
}

test('vyberFrontuKPrekladu: žádná fronta nemá práci -> null', () => {
  assert.equal(
    vyberFrontuKPrekladu({ recipesRemaining: 0, cvikyRemaining: 0, posledniFronta: 'recipes' }),
    null
  );
});

test('vyberFrontuKPrekladu: jen recepty mají práci -> recepty, bez ohledu na historii', () => {
  assert.equal(
    vyberFrontuKPrekladu({ recipesRemaining: 10, cvikyRemaining: 0, posledniFronta: 'recipes' }),
    'recipes'
  );
});

test('vyberFrontuKPrekladu: jen cviky mají práci -> cviky, i když poslední byly taky cviky (regrese)', () => {
  assert.equal(
    vyberFrontuKPrekladu({ recipesRemaining: 0, cvikyRemaining: 183, posledniFronta: 'exercises' }),
    'exercises'
  );
});

test('vyberFrontuKPrekladu: obě mají práci -> střídá se podle historie', () => {
  assert.equal(
    vyberFrontuKPrekladu({ recipesRemaining: 10, cvikyRemaining: 183, posledniFronta: 'recipes' }),
    'exercises'
  );
  assert.equal(
    vyberFrontuKPrekladu({ recipesRemaining: 10, cvikyRemaining: 183, posledniFronta: 'exercises' }),
    'recipes'
  );
});

test('vyberFrontuKPrekladu: obě mají práci, bez historie (první běh) -> recepty', () => {
  assert.equal(
    vyberFrontuKPrekladu({ recipesRemaining: 10, cvikyRemaining: 183, posledniFronta: null }),
    'recipes'
  );
});

test('obě fronty mají práci -> po dvou po sobě jdoucích bězích se přeložilo z OBOU, ne dvakrát z receptů', async () => {
  const runRecipes = spy({ translated: 10, remaining: 0 });
  const runExercises = spy({ translated: 10, remaining: 173 });

  const beh1 = await provedJedenTahPrekladu({
    recipesRemaining: 10,
    cvikyRemaining: 183,
    posledniFronta: null,
    runRecipes,
    runExercises,
  });
  assert.equal(beh1.queuePicked, 'recipes');

  const beh2 = await provedJedenTahPrekladu({
    recipesRemaining: 0,
    cvikyRemaining: 183,
    posledniFronta: beh1.queuePicked,
    runRecipes,
    runExercises,
  });
  assert.equal(beh2.queuePicked, 'exercises');

  assert.equal(runRecipes.volani, 1, 'recepty se přeložily přesně jednou');
  assert.equal(runExercises.volani, 1, 'cviky se přeložily přesně jednou, ne nikdy');
});

test('jen recepty mají práci -> cviky se nevolají', async () => {
  const runRecipes = spy({ translated: 10, remaining: 5 });
  const runExercises = spy({ translated: 0, remaining: 183 });

  const beh = await provedJedenTahPrekladu({
    recipesRemaining: 15,
    cvikyRemaining: 0,
    posledniFronta: 'exercises',
    runRecipes,
    runExercises,
  });

  assert.equal(beh.queuePicked, 'recipes');
  assert.equal(runRecipes.volani, 1);
  assert.equal(runExercises.volani, 0, 'cviky se nesmí volat, když nemají práci');
});

test('jen cviky mají práci -> cviky se přeloží, i když je receptová fronta prázdná (regrese na dnešní stav)', async () => {
  const runRecipes = spy({ translated: 0, remaining: 0 });
  const runExercises = spy({ translated: 10, remaining: 173 });

  const beh = await provedJedenTahPrekladu({
    recipesRemaining: 0,
    cvikyRemaining: 183,
    posledniFronta: 'recipes',
    runRecipes,
    runExercises,
  });

  assert.equal(beh.queuePicked, 'exercises');
  assert.equal(beh.exercises.translated, 10);
  assert.equal(runExercises.volani, 1);
  assert.equal(runRecipes.volani, 0, 'recepty se nesmí volat, když nemají práci');
});

test('žádná fronta nemá práci -> ani jedna se nevolá', async () => {
  const runRecipes = spy({ translated: 0, remaining: 0 });
  const runExercises = spy({ translated: 0, remaining: 0 });

  const beh = await provedJedenTahPrekladu({
    recipesRemaining: 0,
    cvikyRemaining: 0,
    posledniFronta: 'recipes',
    runRecipes,
    runExercises,
  });

  assert.equal(beh.queuePicked, null);
  assert.equal(runRecipes.volani, 0);
  assert.equal(runExercises.volani, 0);
});

test('jeden běh nikdy nepustí dvě velká OpenAI volání — ani když obě fronty mají práci', async () => {
  const runRecipes = spy({ translated: 10, remaining: 0 });
  const runExercises = spy({ translated: 10, remaining: 173 });

  await provedJedenTahPrekladu({
    recipesRemaining: 10,
    cvikyRemaining: 183,
    posledniFronta: null,
    runRecipes,
    runExercises,
  });

  // Součet volání přes OBĚ funkce dohromady je nejvýš 1 — strukturální
  // záruka, ne shoda okolností: provedJedenTahPrekladu volá jen tu funkci,
  // kterou vybral vyberFrontuKPrekladu, nikdy obě větve najednou.
  assert.equal(runRecipes.volani + runExercises.volani, 1);
});
