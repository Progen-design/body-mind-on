-- =============================================================================
-- compute_recipe_nutrition(recipe_id)
-- Spocita vyzivu receptu ZE SUROVIN. Deterministicky, zadny odhad.
--
-- Postup: ingredience → gramy (unit_conversions) → vyziva (ingredients_nutrition)
-- Obiloviny (ryze, vlocky, quinoa) = SUCHY stav (tak je recepty navazuji).
--
-- Vraci i diagnostiku: kolik surovin se nepodarilo dohledat / prevest.
-- Kdyz neco chybi, vysledek NENI duveryhodny → sloupec complete = false.
-- =============================================================================

create or replace function public.compute_recipe_nutrition(p_recipe_id bigint)
returns table (
  kcal            numeric,
  protein_g       numeric,
  carbs_g         numeric,
  fat_g           numeric,
  ingredients_total     integer,
  ingredients_matched   integer,
  ingredients_unmatched text[],
  complete        boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
with rozpad as (
  select lower(trim(i->>'name'))  as surovina,
         (i->>'amount')::numeric  as mnozstvi,
         i->>'unit'               as jednotka
  from public.recipes_catalog r,
       lateral jsonb_array_elements(r.ingredients) i
  where r.id = p_recipe_id
),
s_gramy as (
  select rz.*,
         coalesce(
           (select uc.grams from public.unit_conversions uc
             where uc.unit = rz.jednotka and uc.ingredient_match = rz.surovina),
           (select uc.grams from public.unit_conversions uc
             where uc.unit = rz.jednotka and uc.ingredient_match is null)
         ) * rz.mnozstvi as gramu
  from rozpad rz
),
spojeno as (
  select sg.surovina, sg.gramu, inu.kcal_per_100g, inu.protein_g_per_100g,
         inu.carbs_g_per_100g, inu.fat_g_per_100g,
         (inu.id is not null and sg.gramu is not null) as ok
  from s_gramy sg
  left join public.ingredients_nutrition inu on inu.name_cs = sg.surovina
)
select
  round(sum(kcal_per_100g        * gramu / 100.0) filter (where ok), 1),
  round(sum(protein_g_per_100g   * gramu / 100.0) filter (where ok), 1),
  round(sum(carbs_g_per_100g     * gramu / 100.0) filter (where ok), 1),
  round(sum(fat_g_per_100g       * gramu / 100.0) filter (where ok), 1),
  count(*)::integer,
  count(*) filter (where ok)::integer,
  coalesce(array_agg(surovina) filter (where not ok), '{}'::text[]),
  (count(*) = count(*) filter (where ok))
from spojeno;
$$;

comment on function public.compute_recipe_nutrition(bigint) is
  'Deterministicky vypocet vyzivy receptu ze surovin. complete=false → nektera surovina chybi v ingredients_nutrition nebo unit_conversions, vysledku NEVERIT.';;
