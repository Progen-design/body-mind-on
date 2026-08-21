-- Výpočet nutrice ze surovin BEZ existujícího řádku v katalogu.
--
-- compute_recipe_nutrition(bigint) potřebuje recept už v tabulce, takže
-- generátor musel zapisovat dvoufázově: vložit řádek, spočítat, dopsat čísla.
-- Jenže recipes_catalog.kcal je NOT NULL, takže první fáze vždycky spadla —
-- prvních deset vygenerovaných receptů skončilo na
-- „null value in column kcal violates not-null constraint“.
--
-- Obejít to vložením nuly by znamenalo mít v tabulce řádek s vymyšleným číslem,
-- byť neaktivní a jen na okamžik. To je přesně ta věc, kterou generátor nemá
-- dělat, a při pádu procesu mezi fázemi by tam zůstal natrvalo.
--
-- Řešení: nutrice se spočítá ze surovin dřív, než recept vznikne. Zapíše se
-- jediným INSERTem, se skutečnými čísly, nebo vůbec.
--
-- Tělo je doslovný přepis compute_recipe_nutrition, jen čte suroviny z parametru
-- místo z tabulky. Aby existovala jedna implementace, compute_recipe_nutrition
-- se na tuhle funkci přepisuje.

CREATE OR REPLACE FUNCTION public.compute_nutrition_for_ingredients(p_ingredients jsonb)
RETURNS TABLE(kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
              ingredients_total integer, ingredients_matched integer,
              ingredients_unmatched text[], complete boolean)
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

COMMENT ON FUNCTION public.compute_nutrition_for_ingredients(jsonb) IS
  'Nutrice ze surovin bez existujiciho receptu. Umoznuje spocitat cisla PRED zapisem do katalogu. Stejna logika jako compute_recipe_nutrition, ktera na ni deleguje.';

-- Jedna implementace: compute_recipe_nutrition se stává tenkou obálkou.
CREATE OR REPLACE FUNCTION public.compute_recipe_nutrition(p_recipe_id bigint)
RETURNS TABLE(kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
              ingredients_total integer, ingredients_matched integer,
              ingredients_unmatched text[], complete boolean)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  select c.*
  from public.recipes_catalog r
  cross join lateral public.compute_nutrition_for_ingredients(r.ingredients) c
  where r.id = p_recipe_id;
$function$;

-- ---------------------------------------------------------------------------
-- Kontrola: obě cesty musí dát na existujícím receptu totéž.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id      bigint;
  v_stara   numeric;
  v_nova    numeric;
  v_complete boolean;
BEGIN
  SELECT id INTO v_id FROM public.recipes_catalog
  WHERE nutrition_source = 'computed_from_ingredients' AND active
  ORDER BY id LIMIT 1;

  IF v_id IS NULL THEN
    RAISE NOTICE 'Zadny referencni recept, kontrola preskocena.';
    RETURN;
  END IF;

  SELECT kcal, complete INTO v_stara, v_complete
  FROM public.compute_recipe_nutrition(v_id);

  SELECT c.kcal INTO v_nova
  FROM public.recipes_catalog r
  CROSS JOIN LATERAL public.compute_nutrition_for_ingredients(r.ingredients) c
  WHERE r.id = v_id;

  IF v_stara IS DISTINCT FROM v_nova THEN
    RAISE EXCEPTION 'Recept %: stara cesta % kcal, nova % kcal.', v_id, v_stara, v_nova;
  END IF;
  RAISE NOTICE 'Kontrola OK na receptu % (% kcal, complete=%).', v_id, v_nova, v_complete;
END $$;
