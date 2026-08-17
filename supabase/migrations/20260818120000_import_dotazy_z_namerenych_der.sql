-- Doplnění zásobníku importních dotazů podle NAMĚŘENÝCH děr v katalogu.
--
-- Stav 18. 8. 2026 (685 aktivních receptů):
--
--   slot      aktivní  low_carb  vegan  vegetarian
--   obed        203        9       11       21
--   snidane     152        8       11       44
--   svacina     151        8        9       32
--   vecere      179       45       12       21
--
-- Rotace přitom dojížděla: ze 56 dotazů bylo 44 vyčerpaných a u snídaní
-- a svačin zbýval po jediném živém.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ČÁST 1 — ŠEST DOTAZŮ, KTERÉ NIKDY NEDĚLALY, CO MĚLY
--
-- Dotazy 2725–2730 měly cílit na nízkosacharidové recepty přes `maxCarbs`.
-- Jenže `applyQueryParamsToSearch` byl whitelist a `maxCarbs` v něm nebyl —
-- na Spoonacular se ten limit nikdy neodeslal. Doběhly tedy jako obyčejné
-- dotazy, vytěžily běžnou nabídku a retirovaly se jako `pool_exhausted`.
-- Odtud ta díra: low_carb má u tří slotů jednotky receptů, u večeře 45.
--
-- Whitelist je opravený v lib/spoonacular/importQueryRotation.js. Tady se jim
-- jen maže razítko vyčerpání a offset, aby se rozjely znovu — tentokrát
-- s filtrem, který mají v `params` napsaný.
--
-- ČÁST 2 — nové dotazy na sloty, kde je díra změřená. Nižší `priority`
-- znamená dřív na řadě (řadí se vzestupně), takže díry předbíhají rutinu.

-- ── ČÁST 1 ───────────────────────────────────────────────────────────────────
update public.spoonacular_import_queries
set exhausted_at = null,
    retired_reason = null,
    next_offset = 0,
    empty_streak = 0,
    total_results = null,
    last_run_at = null
where params ? 'maxCarbs'
  and exhausted_at is not null;

-- ── ČÁST 2 ───────────────────────────────────────────────────────────────────
insert into public.spoonacular_import_queries
  (meal_type, catalog_meal_type, params, query_signature, priority)
values
  -- low_carb: obed 9, snidane 8, svacina 8 (večeře jich má 45)
  ('main course', 'obed',
   '{"type":"main course","maxCarbs":40,"minCalories":400,"maxCalories":800,"maxReadyTime":40}'::jsonb,
   'main course|carb=40|kcal=400-800|rt=40|slot=obed', 5),
  ('breakfast', 'snidane',
   '{"type":"breakfast","maxCarbs":30,"minCalories":250,"maxCalories":550,"maxReadyTime":25}'::jsonb,
   'breakfast|carb=30|kcal=250-550|rt=25|slot=snidane', 5),
  ('snack', 'svacina',
   '{"type":"snack","maxCarbs":15,"minCalories":120,"maxCalories":350,"maxReadyTime":15}'::jsonb,
   'snack|carb=15|kcal=120-350|rt=15|slot=svacina', 5),
  ('appetizer', 'svacina',
   '{"type":"appetizer","maxCarbs":30,"minCalories":150,"maxCalories":400,"maxReadyTime":20}'::jsonb,
   'appetizer|carb=30|kcal=150-400|rt=20|slot=svacina', 5),

  -- vegan: 9–12 na každém slotu, nejtenčí dieta v katalogu
  ('breakfast', 'snidane',
   '{"diet":"vegan","type":"breakfast","minCalories":300,"maxCalories":700,"maxReadyTime":25}'::jsonb,
   'breakfast|di=vegan|kcal=300-700|rt=25|slot=snidane', 8),
  ('main course', 'obed',
   '{"diet":"vegan","type":"main course","minCalories":450,"maxCalories":900,"maxReadyTime":35}'::jsonb,
   'main course|di=vegan|kcal=450-900|rt=35|slot=obed', 8),
  ('snack', 'svacina',
   '{"diet":"vegan","type":"snack","minCalories":150,"maxCalories":400,"maxReadyTime":15}'::jsonb,
   'snack|di=vegan|kcal=150-400|rt=15|slot=svacina', 8),
  ('main course', 'vecere',
   '{"diet":"vegan","type":"main course","minCalories":350,"maxCalories":850,"maxReadyTime":35}'::jsonb,
   'main course|di=vegan|kcal=350-850|rt=35|slot=vecere', 8),

  -- vegetarian: hlavní jídla zaostávají (21 a 21) za snídaněmi (44)
  ('main course', 'obed',
   '{"diet":"vegetarian","type":"main course","minCalories":450,"maxCalories":950,"maxReadyTime":35}'::jsonb,
   'main course|di=vegetarian|kcal=450-950|rt=35|slot=obed', 12),
  ('main course', 'vecere',
   '{"diet":"vegetarian","type":"main course","minCalories":350,"maxCalories":850,"maxReadyTime":35}'::jsonb,
   'main course|di=vegetarian|kcal=350-850|rt=35|slot=vecere', 12)
on conflict (query_signature) do nothing;
