-- Čas přípravy je hlavní kritérium, počet surovin jen měkká pojistka.
--
-- Rozhodnutí (31. 7. 2026): uživateli nevadí víc surovin, vadí mu dlouhá a složitá
-- příprava. Limit hlavních surovin se proto zvedá z 6 na 10; časové limity zůstávají
-- (snidane 15, svacina 10, obed 20, vecere 20) a v JS gate se čas nově stává tvrdou
-- podmínkou — recept s neznámým readyInMinutes neprojde.
--
-- Tahle migrace řeší databázovou stranu: trigger a doaktivování receptů, které
-- blokoval výhradně starý limit 6.

-- ---------------------------------------------------------------------------
-- 1. Trigger MUSÍ být nahrazen PŘED UPDATE. Starý trigger běží i na UPDATE, takže
--    by aktivaci okamžitě zase shodil zpět na false.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_recipe_catalog_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Limit 6 -> 10 (31. 7. 2026). Musi zustat shodny s MEAL_SIMPLICITY_RULES
  -- v lib/spoonacular/catalogImportGate.js.
  IF NEW.active IS TRUE AND public.count_main_ingredients(NEW.ingredients) > 10 THEN
    NEW.active := false;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Aktivace receptů, které blokoval jen starý limit.
--
-- Nutriční brána se NEOBCHÁZÍ. Podmínka je doslovný přepis rowPassesMacroKcalGate
-- z lib/macroKcalConsistency.js, aby nevznikla čtvrtá implementace téhož pravidla:
--   * kcal i všechna tři makra vyplněná
--   * high_fiber tag bránu obchází (vláknina je Atwaterem podhodnocená)
--   * jinak |round(kcal) − round(4P+4C+9F)| / round(kcal) ≤ 10 %,
--     odchylka zaokrouhlená na 1 desetinné místo přesně jako v JS
-- Navíc name_cs, aby se do plánu nedostaly anglické názvy.
-- ---------------------------------------------------------------------------
UPDATE public.recipes_catalog r
SET active = true
WHERE r.active = false
  AND public.count_main_ingredients(r.ingredients) BETWEEN 7 AND 10
  AND r.kcal > 0
  AND r.protein_g IS NOT NULL AND r.carbs_g IS NOT NULL AND r.fat_g IS NOT NULL
  AND r.name_cs IS NOT NULL AND btrim(r.name_cs) <> ''
  AND (
    'high_fiber' = ANY(r.diet_tags)
    OR (
      round(r.kcal) > 0
      AND round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g) > 0
      AND round(
            abs((round(r.kcal)::numeric - round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g)::numeric)
                / round(r.kcal)::numeric) * 100,
            1
          ) <= 10.0
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Kontrola: 297 aktivních + 107 nových = 404. Žádný aktivní recept nad 10 surovin.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_aktivnich integer;
  v_nad_limit integer;
BEGIN
  SELECT count(*) INTO v_aktivnich FROM public.recipes_catalog WHERE active;
  SELECT count(*) INTO v_nad_limit
    FROM public.recipes_catalog
   WHERE active AND public.count_main_ingredients(ingredients) > 10;

  IF v_aktivnich <> 404 THEN
    RAISE EXCEPTION 'Aktivnich receptu je %, cekali jsme 404.', v_aktivnich;
  END IF;
  IF v_nad_limit <> 0 THEN
    RAISE EXCEPTION 'Aktivnich receptu nad 10 hlavnich surovin je %, cekali jsme 0.', v_nad_limit;
  END IF;
END $$;
