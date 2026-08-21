-- Nepřevoditelné jednotky: koření se z výpočtu vynechá, jídlo shodí complete.
--
-- Spoonacular u části surovin nevrací skutečnou jednotku, ale `servings`,
-- `serving` nebo prázdný řetězec. Pro takový zápis neexistuje a nemůže
-- existovat gramážový převod. Dosud to znamenalo `complete = false` i tehdy,
-- když šlo o špetku soli — a recept se kvůli tomu nikdy neaktivoval.
--
-- Nové pravidlo (rozhodnutí uživatele, 31. 7. 2026):
--   * gramáž se nepodařilo určit A is_pantry_ingredient(surovina) = true
--       → surovina se z výpočtu vynechá jako zanedbatelná, complete NEspadne
--   * jinak → complete = false, jako dosud
-- Nikdy se nic neodhaduje. Pantry seznam obsahuje jen koření, bylinky, sůl
-- a podobné položky bez znatelného kalorického příspěvku.
--
-- Sloupce ingredients_total a ingredients_matched zůstávají beze změny
-- (počítají všechny suroviny, resp. plně napárované), takže je z nich pořád
-- vidět, kolik se vynechalo. Mění se jen complete a ingredients_unmatched.

CREATE OR REPLACE FUNCTION public.compute_recipe_nutrition(p_recipe_id bigint)
 RETURNS TABLE(
   kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
   ingredients_total integer, ingredients_matched integer,
   ingredients_unmatched text[], complete boolean
 )
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with rozpad as (
  select lower(extensions.unaccent(regexp_replace(trim(i->>'name'),'\s+',' ','g'))) as n_raw,
         (i->>'amount')::numeric as mnozstvi,
         i->>'unit'              as jednotka
  from public.recipes_catalog r,
       lateral jsonb_array_elements(r.ingredients) i
  where r.id = p_recipe_id
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
      (select uc.grams from public.unit_conversions uc
        where uc.unit = res.jednotka
          and lower(extensions.unaccent(uc.ingredient_match)) = res.rn),
      (select uc.grams from public.unit_conversions uc
        where uc.unit = res.jednotka and uc.ingredient_match is null)
    ) * res.mnozstvi as gramu
  from res
),
spojeno as (
  select sg.rn as surovina, sg.gramu,
    inu.kcal_per_100g, inu.protein_g_per_100g, inu.carbs_g_per_100g, inu.fat_g_per_100g,
    (inu.name_cs is not null and sg.gramu is not null) as ok,
    -- Zanedbatelná: gramáž neurčena a jde o koření/sůl/bylinku ze spíže.
    (sg.gramu is null and public.is_pantry_ingredient(sg.rn)) as zanedbatelna
  from s_gramy sg
  left join lateral (
    select name_cs, kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g
    from public.ingredients_nutrition
    where lower(extensions.unaccent(name_cs)) = sg.rn
    limit 1
  ) inu on true
)
select
  round(sum(kcal_per_100g        * gramu / 100.0) filter (where ok), 1),
  round(sum(protein_g_per_100g   * gramu / 100.0) filter (where ok), 1),
  round(sum(carbs_g_per_100g     * gramu / 100.0) filter (where ok), 1),
  round(sum(fat_g_per_100g       * gramu / 100.0) filter (where ok), 1),
  count(*)::integer,
  count(*) filter (where ok)::integer,
  coalesce(array_agg(surovina) filter (where not ok and not zanedbatelna), '{}'::text[]),
  (count(*) filter (where not ok and not zanedbatelna) = 0)
from spojeno;
$function$;

COMMENT ON FUNCTION public.compute_recipe_nutrition(bigint) IS
  'Deterministicky vypocet vyzivy receptu ze surovin. Suroviny bez prevoditelne jednotky se vynechaji jen tehdy, jsou-li v pantry_ingredients (koreni, sul); jinak complete=false a vysledku NEVERIT.';

-- ---------------------------------------------------------------------------
-- Pravopisné varianty už oseedovaných jednotek.
--
-- Tohle NEJSOU nové nutriční údaje. Ke každému řádku existuje v tabulce
-- singulár nebo jiný zápis téže jednotky se stejnou gramáží — doplňuje se
-- jen tvar, který Spoonacular reálně vrací.
--
--   tsps    ← tsp / teaspoon / teaspoons / t  = 5 g
--   Tbsps   ← tbsp / Tbsp / Tbs / T / tablespoon / tablespoons = 15 g
--   Handful ← handful / handfuls = 30 g
--   slice   ← slices = 20 g
--   pkt     ← packet = 10 g
--
-- Jednotky `medium`, `large`, `small`, `inch(es)` a `leaf` tu ZÁMĚRNĚ nejsou.
-- Ty závisí na konkrétní surovině a vyžadují skutečný zdroj (USDA FDC,
-- sekce Portions). Nic z nich se odhadovat nebude.
-- ---------------------------------------------------------------------------
INSERT INTO public.unit_conversions (unit, ingredient_match, grams, note)
SELECT v.unit, NULL, v.grams, v.note
FROM (VALUES
  ('tsps',    5::numeric,  'pravopisna varianta tsp'),
  ('Tbsps',  15::numeric,  'pravopisna varianta Tbsp'),
  ('Handful',30::numeric,  'velka pocatecni pismena, varianta handful'),
  ('slice',  20::numeric,  'singular ke slices'),
  ('pkt',    10::numeric,  'zkratka packet')
) AS v(unit, grams, note)
WHERE NOT EXISTS (
  SELECT 1 FROM public.unit_conversions uc
  WHERE uc.unit = v.unit AND uc.ingredient_match IS NULL
);

-- Kontrola: aktivních receptů se tahle migrace nesmí dotknout.
DO $$
DECLARE
  aktivnich integer;
BEGIN
  SELECT count(*) INTO aktivnich FROM public.recipes_catalog WHERE active IS TRUE;
  IF aktivnich <> 297 THEN
    RAISE EXCEPTION 'Aktivnich receptu je %, cekali jsme 297.', aktivnich;
  END IF;
END
$$;
