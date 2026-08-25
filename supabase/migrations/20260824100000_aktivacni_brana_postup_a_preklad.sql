-- Aktivační brána: recept bez postupu a s anglickými surovinami se neaktivuje.
--
-- PROČ. Watchdog nahlásil 20 aktivních receptů bez použitelného postupu —
-- klient dostal jídlo bez návodu. Kroky přitom v `instructions` byly,
-- `instructions_cs` bylo NULL; zbackfillováno 24. 8. 2026 přímo v datech.
-- Backfill je ale následek. Příčina je tahle brána: `enforce_recipe_catalog_rules`
-- hlídá kcal, Atwatera, počet surovin, název, čas a dietní tagy, ale postup
-- ani jazyk surovin ne. Bez téhle migrace se to zopakuje u dalšího importu.
--
-- DVĚ NOVÉ PODMÍNKY, g) a h), a to na OBOU místech:
--   trigger  `enforce_recipe_catalog_rules` — brání aktivaci při zápisu
--   sweeper  `sweep_recipe_catalog_activation` — denní doaktivace
-- Kdyby přibyly jen do triggeru, sweeper by je druhý den zase zapnul.
--
-- ZMĚŘENO 24. 8. 2026 na produkci, než se tohle pustilo:
--   929 receptů, 727 aktivních
--   0 aktivních bez `instructions_cs`  → podmínka g) dnes nikoho nevypne
--   0 aktivních s opravdu nepřeloženou surovinou
--
-- ŽÁDNÝ RECEPT SE TÍM NEDEAKTIVUJE. První verze podmínky h) hlásila 25
-- aktivních receptů, ale to byla vada měření, ne dat: shoda `name`
-- a `name_en` u přejatých slov (quinoa, tofu, mango, feta, farfalle…)
-- není nepřeložená surovina. Po doplnění `je_prejata_surovina()` je jich nula.
--
-- Až se nějaký objeví, deaktivuje se při zápisu a sweeper ho nezapne zpátky,
-- dokud překlad nedoběhne. Cesta ven je překlad, ne výjimka:
-- `runCatalogRecipeTranslation` recepty od 23. 8. vybírá přes `zbyvaPrelozit`,
-- takže se do fronty dostanou i ty, které mají přeložený jen název.

-- Postup musí být neprázdné pole. NULL, `[]` i jiný typ znamenají „není“.
create or replace function public.recipe_ma_postup(p_instructions_cs jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select p_instructions_cs is not null
     and jsonb_typeof(p_instructions_cs) = 'array'
     and jsonb_array_length(p_instructions_cs) > 0
     -- Aspoň jeden POUŽITELNÝ krok. Práh 3 znaky je tentýž jako
     -- v `pouzitelneKroky()`; pole prázdných řetězců ani jednoslovných
     -- útržků není postup.
     and exists (
       select 1 from jsonb_array_elements_text(p_instructions_cs) k
       where length(btrim(k)) >= 3
     );
$$;

comment on function public.recipe_ma_postup(jsonb) is
  'Má recept použitelný postup? Zrcadlí pouzitelneKroky() z lib/profile/postupReceptu.js.';

-- Kolik surovin zůstalo anglicky.
--
-- Zrcadlí `jeSurovinaNeprelozena` z lib/spoonacular/prekladStav.js: překlad
-- zapisuje češtinu do `name` a originál si odkládá do `name_en`. Když se ty
-- dva rovnají, u téhle suroviny překlad neproběhl. Surovina bez `name_en` je
-- z doby před zavedením překladu — tam se nedá poznat nic a za nepřeloženou
-- se považuje jen tehdy, když `name` chybí úplně.
--
-- PŘEJATÁ SLOVA SE NEPOČÍTAJÍ. Shoda `name` a `name_en` sama o sobě překlad
-- nevyvrací: „quinoa“, „tofu“, „mango“, „feta“ nebo „farfalle“ jsou česky
-- stejně jako anglicky. Bez `je_prejata_surovina()` by tahle podmínka
-- deaktivovala 25 aktivních receptů, u kterých je všechno v pořádku —
-- změřeno 24. 8. 2026: u všech 25 vrací `je_prejata_surovina` true, opravdu
-- nepřeloženou surovinu nemá ani jeden.
--
-- Je to tatáž chyba, jaká 22. 8. 2026 držela překladový cron v placené
-- smyčce: heuristika „name == name_en“ bez seznamu přejatých slov. Proto se
-- tady volá tentýž predikát, jaký používá větev `recept_anglicka_surovina`
-- v `system_health_alerts` — jeden zdroj pravdy, ne druhá heuristika.
create or replace function public.recipe_neprelozenych_surovin(p_ingredients jsonb)
returns integer
language sql
immutable
set search_path to 'public'
as $$
  select coalesce((
    select count(*)::integer
    from jsonb_array_elements(
      case when jsonb_typeof(p_ingredients) = 'array' then p_ingredients else '[]'::jsonb end
    ) e
    where coalesce(btrim(e->>'name'), '') = ''
       or (
         coalesce(btrim(e->>'name_en'), '') <> ''
         and lower(btrim(e->>'name')) = lower(btrim(e->>'name_en'))
         and not public.je_prejata_surovina(e->>'name')
       )
  ), 0);
$$;

comment on function public.recipe_neprelozenych_surovin(jsonb) is
  'Počet surovin, které zůstaly anglicky. Přejatá slova (quinoa, tofu, feta…) '
  'se nepočítají — viz je_prejata_surovina(). Tentýž predikát používá větev '
  'recept_anglicka_surovina v system_health_alerts.';

-- ---------------------------------------------------------------- trigger

create or replace function public.enforce_recipe_catalog_rules()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
BEGIN
  IF NEW.active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.pending_review THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- a) kcal a všechna tři makra vyplněná
  IF NEW.kcal IS NULL OR NEW.kcal <= 0
     OR NEW.protein_g IS NULL OR NEW.carbs_g IS NULL OR NEW.fat_g IS NULL THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- b) Atwater, tolerance 10 %. Vláknina se odečítá — viz public.atwater_ok.
  IF NOT (
    'high_fiber' = ANY(NEW.diet_tags)
    OR public.atwater_ok(NEW.kcal, NEW.protein_g, NEW.carbs_g, NEW.fat_g,
                         public.recipe_fiber_g(NEW.ingredients), 10.0)
  ) THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- c) počet hlavních surovin
  IF public.count_main_ingredients(NEW.ingredients) > 10 THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- d) český název
  IF NEW.name_cs IS NULL OR btrim(NEW.name_cs) = '' THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- e) ČAS — ZAPNUTO PRO VŠECHNY SLOTY.
  --      snidane 20, svacina 15, obed 30, vecere 30.
  --
  -- NULL NEDEAKTIVUJE. Podmínka je "známe čas A je nad limitem". Recept bez
  -- měřené hodnoty i bez odhadu zůstává aktivní a posoudí se sám, až odhad
  -- doplní scripts/estimate-prep-time.mjs — přes sweeper.
  IF coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated) IS NOT NULL
     AND coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated)
         > public.slot_time_limit(NEW.meal_type) THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- f) dietní tag musí sedět se surovinami
  IF 'vegan' = ANY(NEW.diet_tags)
     AND array_length(public.recipe_diet_conflicts(NEW.ingredients, 'vegan'), 1) IS NOT NULL THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  IF 'vegetarian' = ANY(NEW.diet_tags)
     AND array_length(public.recipe_diet_conflicts(NEW.ingredients, 'vegetarian'), 1) IS NOT NULL THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- g) POSTUP PŘÍPRAVY. Jídlo bez návodu je horší než jídlo, které se
  --    nenabídne. Na rozdíl od času tady NULL DEAKTIVUJE — chybějící postup
  --    není "ještě nezměřeno", je to chybějící recept.
  IF NOT public.recipe_ma_postup(NEW.instructions_cs) THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- h) SUROVINY MUSÍ BÝT PŘELOŽENÉ. Klient nemá v nákupním seznamu číst
  --    "old fashioned oats" ani "Salt to taste".
  IF public.recipe_neprelozenych_surovin(NEW.ingredients) > 0 THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------- sweeper

create or replace function public.sweep_recipe_catalog_activation()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_aktivovano integer;
  v_aktivnich  integer;
BEGIN
  WITH zmeneno AS (
    UPDATE public.recipes_catalog r
    SET active = true
    WHERE r.active = false
      AND NOT r.pending_review
      AND r.kcal > 0
      AND r.protein_g IS NOT NULL AND r.carbs_g IS NOT NULL AND r.fat_g IS NOT NULL
      AND public.count_main_ingredients(r.ingredients) <= 10
      AND r.name_cs IS NOT NULL AND btrim(r.name_cs) <> ''
      AND (
        'high_fiber' = ANY(r.diet_tags)
        OR public.atwater_ok(r.kcal, r.protein_g, r.carbs_g, r.fat_g,
                             public.recipe_fiber_g(r.ingredients), 10.0)
      )
      AND NOT (
        'vegan' = ANY(r.diet_tags)
        AND array_length(public.recipe_diet_conflicts(r.ingredients, 'vegan'), 1) IS NOT NULL
      )
      AND NOT (
        'vegetarian' = ANY(r.diet_tags)
        AND array_length(public.recipe_diet_conflicts(r.ingredients, 'vegetarian'), 1) IS NOT NULL
      )
      -- ČAS: všechny sloty (snidane 20, svacina 15, obed 30, vecere 30).
      -- NULL čas aktivaci NEBRÁNÍ — stejně jako v bráně.
      AND NOT (
        coalesce(r.ready_in_minutes, r.prep_minutes_estimated) IS NOT NULL
        AND coalesce(r.ready_in_minutes, r.prep_minutes_estimated)
            > public.slot_time_limit(r.meal_type)
      )
      -- g) postup přípravy — stejná podmínka jako v bráně
      AND public.recipe_ma_postup(r.instructions_cs)
      -- h) přeložené suroviny — stejná podmínka jako v bráně
      AND public.recipe_neprelozenych_surovin(r.ingredients) = 0
    RETURNING r.id
  )
  SELECT count(*) INTO v_aktivovano FROM zmeneno;
  SELECT count(*) INTO v_aktivnich FROM public.recipes_catalog WHERE active;
  RETURN jsonb_build_object('activated', v_aktivovano, 'active_total', v_aktivnich, 'swept_at', now());
END;
$function$;
