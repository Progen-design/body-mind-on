-- Vláknina se nikam nezapisuje — trigger ji počítá, ale jen pro Atwaterovu
-- bránu, ne pro sloupec. docs/DALSI_KROK.md 8.17.
--
-- 488 z 875 aktivních receptů (463 z 513 llm_generated) má `fiber_g` NULL.
-- PŮVODNÍ DIAGNÓZA (generátor nepočítá vlákninu) BYLA NEÚPLNÁ: kořen není
-- v `lib/recipeGeneratorRun.js`, je v triggeru. `enforce_recipe_catalog_rules()`
-- už `public.recipe_fiber_g(NEW.ingredients)` VOLÁ — ale jen jako argument
-- do `atwater_ok()` při rozhodování o `active`, výsledek nikam neuloží.
-- `NEW.fiber_g` se nikdy nenastaví, ať recept vznikl generátorem,
-- Spoonacular importem, coach seedem nebo ručním vložením — je to trigger
-- na `recipes_catalog`, běží při KAŽDÉM zápisu, ne jen tom jednom.
--
-- Řešení proto NENÍ dopočet z JS (pokrylo by to jen generátor, duplikovalo
-- by SQL tělo v JS a přidalo RPC volání navíc) — je to doplnění triggeru,
-- který tu logiku už jednou počítá.
--
-- PROČ NOVÁ FUNKCE, NE ÚPRAVA compute_nutrition_for_ingredients.
-- `compute_nutrition_for_ingredients` má osmisloupcový `RETURNS TABLE`.
-- `CREATE OR REPLACE FUNCTION` neumí změnit návratový typ (chyba 42P13)
-- a `DROP FUNCTION` neprojde, protože na `compute_recipe_nutrition` visí
-- view `system_health_alerts_zaklad` — přesně tahle past shodila bod 8.9.
-- `compute_nutrition_for_ingredients` ani `compute_recipe_nutrition` se
-- proto NEMĚNÍ, ani signatura, ani tělo. Nesahá se ani na `atwater_ok`.
-- Vzniká samostatná `compute_fiber_for_ingredients()`.
--
-- MATCHOVÁNÍ SUROVIN A PŘEVOD JEDNOTEK JE ZKOPÍROVANÝ 1:1 z aktuálního
-- těla `compute_nutrition_for_ingredients` (viz
-- supabase/migrations/20260804230000_pantry_tuky_ven_a_zanedbatelnost.sql,
-- ověřeno přes `pg_get_functiondef`) — tedy `lower(extensions.unaccent(...))`,
-- `ingredient_aliases`, `unit_conversions` se čtyřmi fallbacky (přesná
-- jednotka + konkrétní surovina -> case-insensitive + jednoznačná ->
-- přesná jednotka + obecný fallback -> case-insensitive obecný fallback,
-- jednoznačný). Liší se jen tím, co se sčítá: vláknina místo
-- kcal/bílkovin/sacharidů/tuku, a NEŘEŠÍ "zanedbatelnost" přes
-- `is_pantry_ingredient` ani seznam nedohledaných surovin — to je
-- koncept úplnosti receptu pro `zapisRecept()`, tady žádná obdoba není.
--
-- NULL ZNAMENÁ "NESPOČÍTÁNO", NE NULA. Součet běží jen přes suroviny, kde
-- je surovina i gramáž dohledaná A `fiber_g_per_100g` není null
-- (`filter (where ok)`). Když touhle podmínkou neprojde ani jedna
-- surovina, `sum(...) filter (...)` nad prázdnou množinou v Postgresu
-- vrátí NULL samo — netřeba `coalesce`. Nula smí vyjít jen tehdy, když
-- se sečetly samé suroviny se skutečně nulovou (ne neznámou) vlákninou.
--
-- `public.recipe_fiber_g(jsonb)` (supabase/migrations/20260805150000_
-- vlaknina_a_atwater.sql) MĚLA stejné matchování zkopírované znovu, ale
-- jinou sémantiku nuly (`coalesce(sum(...), 0)` — 0 i když je vláknina
-- u všech surovin neznámá, protože pro `atwater_ok()` "neznámá = 0" je
-- žádoucí: odečtení nuly nic nezmění). Duplicita dvou těl nad stejnými
-- daty je přesně ten vzorec, který tenhle repo chytil už popáté (viz
-- hlavička 20260805150000) — proto se `recipe_fiber_g` níž přepisuje na
-- jednořádkový wrapper nad `compute_fiber_for_ingredients`. Signatura
-- i návratový typ zůstávají, `CREATE OR REPLACE` proto projde a chování
-- `atwater_ok` je bitově stejné jako předtím.
CREATE FUNCTION public.compute_fiber_for_ingredients(p_ingredients jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with rozpad as (
  select lower(extensions.unaccent(regexp_replace(trim(i->>'name'),'\s+',' ','g'))) as n_raw,
         (i->>'amount')::numeric as mnozstvi,
         i->>'unit'              as jednotka
  from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) i
),
res as (
  select rz.mnozstvi, rz.jednotka,
    coalesce(
      (select a.canonical_normalized from public.ingredient_aliases a
        where a.alias_normalized = rz.n_raw),
      rz.n_raw
    ) as rn
  from rozpad rz
),
s_gramy as (
  select res.rn,
    coalesce(
      -- 1) presna jednotka + konkretni surovina
      (select uc.grams from public.unit_conversions uc
        where uc.unit = res.jednotka
          and lower(extensions.unaccent(uc.ingredient_match)) = res.rn),
      -- 2) jina velikost pismen + konkretni surovina, jen kdyz je jednoznacna
      (select max(uc.grams) from public.unit_conversions uc
        where lower(uc.unit) = lower(res.jednotka)
          and lower(extensions.unaccent(uc.ingredient_match)) = res.rn
        having count(distinct uc.grams) = 1),
      -- 3) presna jednotka + obecny fallback
      (select uc.grams from public.unit_conversions uc
        where uc.unit = res.jednotka and uc.ingredient_match is null),
      -- 4) jina velikost pismen + obecny fallback, jen kdyz je jednoznacny
      (select max(uc.grams) from public.unit_conversions uc
        where lower(uc.unit) = lower(res.jednotka) and uc.ingredient_match is null
        having count(distinct uc.grams) = 1)
    ) * res.mnozstvi as gramu
  from res
),
spojeno as (
  select sg.gramu, inu.fiber_g_per_100g,
    (inu.fiber_g_per_100g is not null and sg.gramu is not null) as ok
  from s_gramy sg
  left join lateral (
    select fiber_g_per_100g
    from public.ingredients_nutrition
    where lower(extensions.unaccent(name_cs)) = sg.rn
    limit 1
  ) inu on true
)
select round(sum(fiber_g_per_100g * gramu / 100.0) filter (where ok), 1)
from spojeno;
$function$;

COMMENT ON FUNCTION public.compute_fiber_for_ingredients(jsonb) IS
  'Vláknina receptu ze surovin, matchování a převod jednotek stejné jako compute_nutrition_for_ingredients (samostatná funkce, viz docs/DALSI_KROK.md 8.17 — RETURNS TABLE u compute_nutrition_for_ingredients nejde CREATE OR REPLACE přetypovat). NULL = ani jedna surovina nemá známou vlákninu, ne nula. Jediné místo, kde se matchování surovin pro vlákninu skutečně počítá — recipe_fiber_g() je nad ní tenký wrapper.';

-- ---------------------------------------------------------------------------
-- recipe_fiber_g jako jednořádkový wrapper — signatura a návratový typ
-- beze změny, takže CREATE OR REPLACE projde a atwater_ok() se chová
-- bitově stejně jako předtím (0 pro neznámou vlákninu, ne NULL).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recipe_fiber_g(p_ingredients jsonb)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO ''
AS $$ select coalesce(public.compute_fiber_for_ingredients(p_ingredients), 0); $$;

COMMENT ON FUNCTION public.recipe_fiber_g(jsonb) IS
  'Tenký wrapper nad compute_fiber_for_ingredients() — coalesce na 0, protože atwater_ok() potřebuje číslo k odečtení od kalorií, ne NULL. Matchování surovin a převod jednotek žije jen v compute_fiber_for_ingredients(), tady se nic neduplikuje (docs/DALSI_KROK.md 8.17).';

-- ---------------------------------------------------------------------------
-- enforce_recipe_catalog_rules — jediná změna je nastavení NEW.fiber_g,
-- hned vedle přepočtu diet_tags, PŘED "IF NEW.active IS NOT TRUE": ze
-- stejného důvodu jako u diet_tags výš — i řádek čekající na aktivaci
-- (nebo jednou deaktivovaný) má nést spočítanou hodnotu, ne nic.
--
-- Zbytek těla je beze změny, zkopírovaný z aktuální produkční definice
-- (naposledy měnila supabase/migrations/20260824120000_lepek_a_odvozene_
-- dietni_tagy.sql), ne ze staré migrace 20260805150000 — ta uz nesedi
-- s produkci (mezitim pribyly odvozene tagy, slot_time_limit misto
-- pevnych 30 minut jen pro obed/vecere, postup a preklad surovin).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_recipe_catalog_rules()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
BEGIN
  -- ODVOZENÉ TAGY SE PŘEPOČÍTÁVAJÍ VŽDY, i u neaktivního receptu.
  -- Jinak by řádek čekající na aktivaci nesl tvrzení od modelu, na které se
  -- pak podívá sweeper.
  NEW.diet_tags := public.prepocti_odvozene_tagy(
    NEW.diet_tags, NEW.ingredients, NEW.kcal, NEW.carbs_g
  );

  -- VLÁKNINA SE POČÍTÁ VŽDY, i u neaktivního receptu — docs/DALSI_KROK.md
  -- 8.17. Ze stejného důvodu jako diet_tags výš: řádek čekající na aktivaci
  -- (nebo jednou deaktivovaný) má nést spočítanou hodnotu, ne nic. NULL
  -- zůstává NULL (ani jedna surovina nemá známou vlákninu), nikdy se
  -- nedosazuje vymyšlená nula.
  NEW.fiber_g := round(public.compute_fiber_for_ingredients(NEW.ingredients), 1);

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
  -- NULL NEDEAKTIVUJE. Podmínka je "známe čas A je nad limitem".
  IF coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated) IS NOT NULL
     AND coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated)
         > public.slot_time_limit(NEW.meal_type) THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- f) vegan a vegetarian se OVĚŘUJÍ, nepřepočítávají. Recept bez masa není
  --    automaticky nabídka pro vegana — u těchhle diet je tag i rozhodnutí
  --    o zařazení, ne jen popis složení.
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
  --    nenabídne. Na rozdíl od času tady NULL DEAKTIVUJE.
  IF NOT public.recipe_ma_postup(NEW.instructions_cs) THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- h) SUROVINY MUSÍ BÝT PŘELOŽENÉ. Přejatá slova (quinoa, tofu, feta…)
  --    se nepočítají — viz je_prejata_surovina().
  IF public.recipe_neprelozenych_surovin(NEW.ingredients) > 0 THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Kontroly — čistá logika na literálech, žádný dotaz do produkčních tabulek
-- s recepty. banán (2,6 g/100g) a celozrnný chléb (6,0 g/100g) jsou dva ze
-- 146 surovin s vlákninou, které migrace 20260805150000/20260906180000 už
-- ověřeně doplnily.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_znama    numeric;
  v_neznama  numeric;
  v_prazdna  numeric;
  v_castecna numeric;
  v_wrap_neznama numeric;
  v_wrap_prazdna numeric;
  v_wrap_znama   numeric;
BEGIN
  -- 1) Dvě suroviny se známou vlákninou: 200 g banán (2,6) + 100 g celozrnný
  --    chléb (6,0) = 5,2 + 6,0 = 11,2.
  SELECT public.compute_fiber_for_ingredients(
    '[{"name":"banán","amount":200,"unit":"g"},{"name":"celozrnný chléb","amount":100,"unit":"g"}]'::jsonb
  ) INTO v_znama;
  IF v_znama IS DISTINCT FROM 11.2 THEN
    RAISE EXCEPTION 'banán+celozrnný chléb: čekáno 11.2, je %', v_znama;
  END IF;

  -- 2) Surovina, která ve slovníku není -> NULL, ne 0.
  SELECT public.compute_fiber_for_ingredients(
    '[{"name":"xyz_neexistujici_surovina_8_17","amount":100,"unit":"g"}]'::jsonb
  ) INTO v_neznama;
  IF v_neznama IS NOT NULL THEN
    RAISE EXCEPTION 'neznámá surovina musí dát NULL, je %', v_neznama;
  END IF;

  -- 3) Prázdný seznam surovin -> NULL.
  SELECT public.compute_fiber_for_ingredients('[]'::jsonb) INTO v_prazdna;
  IF v_prazdna IS NOT NULL THEN
    RAISE EXCEPTION 'prázdný recept musí dát NULL, je %', v_prazdna;
  END IF;

  -- 4) Jedna známá (banán) + jedna neznámá surovina -> sečte se jen banán,
  --    neznámá se nepočítá jako nula ani recept nezablokuje.
  SELECT public.compute_fiber_for_ingredients(
    '[{"name":"banán","amount":100,"unit":"g"},{"name":"xyz_neexistujici_surovina_8_17","amount":50,"unit":"g"}]'::jsonb
  ) INTO v_castecna;
  IF v_castecna IS DISTINCT FROM 2.6 THEN
    RAISE EXCEPTION 'banán (100 g) + neznámá surovina: čekáno 2.6 (jen banán), je %', v_castecna;
  END IF;

  -- 5) recipe_fiber_g je jen coalesce(..., 0) nad compute_fiber_for_ingredients
  --    — tam, kde ten vrací NULL, wrapper musí dát 0 (atwater_ok potřebuje
  --    číslo k odečtení, ne NULL).
  SELECT public.recipe_fiber_g(
    '[{"name":"xyz_neexistujici_surovina_8_17","amount":100,"unit":"g"}]'::jsonb
  ) INTO v_wrap_neznama;
  IF v_wrap_neznama IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'recipe_fiber_g musí dát 0 tam, kde compute_fiber_for_ingredients dává NULL (neznámá surovina), je %', v_wrap_neznama;
  END IF;

  SELECT public.recipe_fiber_g('[]'::jsonb) INTO v_wrap_prazdna;
  IF v_wrap_prazdna IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'recipe_fiber_g(prázdný recept) musí dát 0, ne NULL, je %', v_wrap_prazdna;
  END IF;

  -- 6) a tam, kde compute_fiber_for_ingredients zná číslo, wrapper ho musí
  --    vrátit beze změny, ne jen nulu.
  SELECT public.recipe_fiber_g(
    '[{"name":"banán","amount":200,"unit":"g"},{"name":"celozrnný chléb","amount":100,"unit":"g"}]'::jsonb
  ) INTO v_wrap_znama;
  IF v_wrap_znama IS DISTINCT FROM 11.2 THEN
    RAISE EXCEPTION 'recipe_fiber_g se rozešla se svým zdrojem pro známou vlákninu: čekáno 11.2, je %', v_wrap_znama;
  END IF;

  RAISE NOTICE 'vláknina OK: compute_fiber_for_ingredients znala %, neznámá %(NULL), prázdná %(NULL), částečná %; recipe_fiber_g wrapper neznámá %(0), prázdná %(0), známá %',
    v_znama, v_neznama, v_prazdna, v_castecna, v_wrap_neznama, v_wrap_prazdna, v_wrap_znama;
END $$;
