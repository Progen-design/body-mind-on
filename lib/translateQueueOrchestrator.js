/**
 * lib/translateQueueOrchestrator.js
 * Střídání dvou překladových front v api/cron/translate-recipes.js — recepty
 * (lib/spoonacular/catalogTranslate.js) a postupy cviků
 * (lib/prekladPostupuCviku.js).
 *
 * PROČ TOHLE EXISTUJE
 * Cron dřív pouštěl cviky, jen když `result.translated === 0` (recepty
 * nepřeložily nic). Recepty ale nikdy nedojdou na nulu — /api/cron/
 * import-spoonacular je denně doplňuje — takže cviky nikdy nepřišly na
 * řadu (183 anglických postupů, 0 českých). Původní `if` chránil skutečnou
 * věc (nejvýš jedno velké OpenAI volání za běh, aby se běh vešel do
 * maxDuration 120 s — 23. 8. dva z šesti běhů skončily na 504), ale
 * "nejvýš jedno volání" se omylem proměnilo v "recepty mají absolutní
 * přednost".
 *
 * ŘEŠENÍ: kolotočové střídání (round-robin) přes perzistovaný ukazatel
 * "kdo byl na řadě naposled" (lib/translateQueueTurn.js). Zvažoval jsem
 * i bezstavovou alternativu (např. sudá/lichá minuta), ale ta se láme,
 * jakmile cron jednou vynechá běh nebo někdo spustí endpoint ručně —
 * ukazatel v DB je přesný, protože zaznamenává, co se OPRAVDU stalo
 * naposled, ne co by se podle hodin mělo stát. Cena je jedna malá tabulka
 * (viz supabase/migrations/20260908110000_translate_queue_turn.sql —
 * NÁVRH, neaplikováno) a dvě lehké UPDATE/SELECT operace navíc, žádné
 * další OpenAI volání.
 *
 * Rozhodnutí (vyberFrontuKPrekladu) je čistá funkce bez závislostí — proto
 * jde testovat bez Supabase i bez OpenAI. Spuštění (provedJedenTahPrekladu)
 * dostává obě "spusť frontu" funkce injektované, takže test může spočítat,
 * kolikrát se která opravdu zavolala, a dokázat tak strukturálně (ne jen
 * náhodou), že se v jednom běhu nikdy nezavolají obě.
 */

/**
 * @param {{
 *   recipesRemaining: number,
 *   cvikyRemaining: number,
 *   posledniFronta: 'recipes'|'exercises'|null,
 * }} stav
 * @returns {'recipes'|'exercises'|null} kterou frontu spustit tento běh; null = ani jedna nemá práci
 */
export function vyberFrontuKPrekladu({ recipesRemaining, cvikyRemaining, posledniFronta }) {
  const maRecepty = Number(recipesRemaining) > 0;
  const maCviky = Number(cvikyRemaining) > 0;

  if (!maRecepty && !maCviky) return null;
  // Jen jedna má práci -> běží ta, druhá se nezkouší zbytečně (žádné
  // zbytečné "prázdné" volání), bez ohledu na to, kdo byl naposled na řadě.
  if (maRecepty && !maCviky) return 'recipes';
  if (!maRecepty && maCviky) return 'exercises';

  // Obě mají práci -> střídání. Kdo byl naposled, teď nejde. Bez zaznamenané
  // historie (první běh, nebo tabulka ještě neexistuje) defaultuje na
  // recepty — nejbližší dnešnímu chování, dokud se ukazatel poprvé zapíše.
  return posledniFronta === 'recipes' ? 'exercises' : 'recipes';
}

/**
 * Provede NEJVÝŠ JEDNO velké volání (runRecipes NEBO runExercises, nikdy
 * obojí v jednom běhu) podle vyberFrontuKPrekladu.
 *
 * @param {{
 *   recipesRemaining: number,
 *   cvikyRemaining: number,
 *   posledniFronta: 'recipes'|'exercises'|null,
 *   runRecipes: () => Promise<{ translated: number, remaining: number, errors?: string[] }>,
 *   runExercises: () => Promise<{ translated: number, remaining: number, errors?: string[] }>,
 * }} args
 * @returns {Promise<{
 *   queuePicked: 'recipes'|'exercises'|null,
 *   recipes: { translated: number, remaining: number, errors?: string[] },
 *   exercises: { translated: number, remaining: number, errors?: string[] },
 * }>}
 */
export async function provedJedenTahPrekladu({
  recipesRemaining,
  cvikyRemaining,
  posledniFronta,
  runRecipes,
  runExercises,
}) {
  const queuePicked = vyberFrontuKPrekladu({ recipesRemaining, cvikyRemaining, posledniFronta });

  let recipes = { translated: 0, remaining: recipesRemaining };
  let exercises = { translated: 0, remaining: cvikyRemaining };

  if (queuePicked === 'recipes') {
    recipes = await runRecipes();
  } else if (queuePicked === 'exercises') {
    exercises = await runExercises();
  }

  return { queuePicked, recipes, exercises };
}
