-- Useknutý zdroj: trvalé vyřazení receptů, které nejdou správně přeložit.
--
-- Spoonacular u části receptů posílá postup useknutý — uprostřed čísla
-- ("Preheat oven to 37" místo 375) nebo prostě bez konce. Model při překladu takový
-- postup buď dopíše, nebo okomentuje, a uživatel obojí čte jako fakt.
--
-- Nalezeno měřením (checker scripts/check-translation-invented-numbers.mjs):
--   545  "Preheat oven to 37"  → CS: "na 37 °C (pravděpodobně chyba, mělo by být 175 °C)"
--   131  postup končí "...place into a baking dish with the chicken broth." a nic dál
--        → CS dopsal celý krok "pečte na 190 °C asi 20–25 minut"
--   119, 81, 71  useknutá teplota / rozměr, zatím bez viditelného dopadu v překladu
--
-- Samotné `active = false` by nestačilo: sweep_recipe_catalog_activation aktivuje
-- cokoli, co splní pravidla, takže by je příští denní běh vrátil zpátky. Proto
-- trvalý příznak, který respektuje trigger i sweeper.

-- ---------------------------------------------------------------------------
-- 1. Příznak
-- ---------------------------------------------------------------------------
ALTER TABLE public.recipes_catalog
  ADD COLUMN IF NOT EXISTS source_truncated      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_truncated_note text;

COMMENT ON COLUMN public.recipes_catalog.source_truncated IS
  'Anglicky zdroj je useknuty, takze recept nejde spravne prelozit. Nikdy se neaktivuje. Rusi se jen rucne po overeni, ze re-import prinesl uplna data.';

-- ---------------------------------------------------------------------------
-- 2. Trigger i sweeper musí příznak respektovat
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_recipe_catalog_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Useknutý zdroj — má přednost před vším ostatním.
  IF NEW.source_truncated IS TRUE THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  IF NEW.kcal IS NULL OR NEW.kcal <= 0
     OR NEW.protein_g IS NULL OR NEW.carbs_g IS NULL OR NEW.fat_g IS NULL THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  IF NOT (
    'high_fiber' = ANY(NEW.diet_tags)
    OR (
      round(NEW.kcal) > 0
      AND round(4*NEW.protein_g + 4*NEW.carbs_g + 9*NEW.fat_g) > 0
      AND round(abs((round(NEW.kcal)::numeric - round(4*NEW.protein_g + 4*NEW.carbs_g + 9*NEW.fat_g)::numeric)
                    / round(NEW.kcal)::numeric) * 100, 1) <= 10.0
    )
  ) THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  IF public.count_main_ingredients(NEW.ingredients) > 10 THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  IF NEW.name_cs IS NULL OR btrim(NEW.name_cs) = '' THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- ČAS zatím nevynucován, viz 20260801081000.

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sweep_recipe_catalog_activation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aktivovano integer;
  v_aktivnich  integer;
BEGIN
  WITH zmeneno AS (
    UPDATE public.recipes_catalog r
    SET active = true
    WHERE r.active = false
      AND r.source_truncated IS NOT TRUE
      AND r.kcal > 0
      AND r.protein_g IS NOT NULL AND r.carbs_g IS NOT NULL AND r.fat_g IS NOT NULL
      AND public.count_main_ingredients(r.ingredients) <= 10
      AND r.name_cs IS NOT NULL AND btrim(r.name_cs) <> ''
      AND (
        'high_fiber' = ANY(r.diet_tags)
        OR (
          round(r.kcal) > 0
          AND round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g) > 0
          AND round(abs((round(r.kcal)::numeric - round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g)::numeric)
                        / round(r.kcal)::numeric) * 100, 1) <= 10.0
        )
      )
    RETURNING r.id
  )
  SELECT count(*) INTO v_aktivovano FROM zmeneno;

  SELECT count(*) INTO v_aktivnich FROM public.recipes_catalog WHERE active;

  RETURN jsonb_build_object('activated', v_aktivovano, 'active_total', v_aktivnich, 'swept_at', now());
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Označení nalezených receptů
-- ---------------------------------------------------------------------------
UPDATE public.recipes_catalog
SET source_truncated = true,
    source_truncated_note = 'Preheat oven to 37 — teplota useknuta ve zdroji, preklad ji nahradil vlastnim komentarem',
    active = false
WHERE id = 545;

UPDATE public.recipes_catalog
SET source_truncated = true,
    source_truncated_note = 'Postup konci pred pecenim, preklad dopsal krok "pecte na 190 °C asi 20-25 minut"',
    active = false
WHERE id = 131;

UPDATE public.recipes_catalog
SET source_truncated = true,
    source_truncated_note = 'Useknuta teplota nebo rozmer v postupu (detekce lib/spoonacular/truncatedSource.js)',
    active = false
WHERE id IN (119, 81, 71);

-- ---------------------------------------------------------------------------
-- 4. Vymyšlený obsah pryč z uložených dat
--
-- I když jsou recepty deaktivované, komentář modelu a dopsaný krok nemají v datech
-- co dělat — kdyby se příznak někdy zrušil, vrátily by se do aplikace s ním.
-- ---------------------------------------------------------------------------

-- 545: pryč se závorkou "(pravděpodobně chyba, mělo by být 175 °C)"
UPDATE public.recipes_catalog
SET instructions_cs = (
  SELECT jsonb_agg(regexp_replace(k, '\s*\(pravděpodobně chyba[^)]*\)', '', 'g') ORDER BY ord)
  FROM jsonb_array_elements_text(instructions_cs) WITH ORDINALITY t(k, ord)
)
WHERE id = 545;

-- 131: pryč s dopsaným posledním krokem o pečení
UPDATE public.recipes_catalog
SET instructions_cs = (
  SELECT jsonb_agg(k ORDER BY ord)
  FROM jsonb_array_elements_text(instructions_cs) WITH ORDINALITY t(k, ord)
  WHERE k !~ 'pečte na 190'
)
WHERE id = 131;

-- ---------------------------------------------------------------------------
-- Kontrola: 5 označených, žádný z nich aktivní, komentář modelu pryč.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_oznacenych integer;
  v_aktivnich_oznacenych integer;
  v_zbyva_komentar integer;
BEGIN
  SELECT count(*) INTO v_oznacenych FROM public.recipes_catalog WHERE source_truncated;
  SELECT count(*) INTO v_aktivnich_oznacenych
    FROM public.recipes_catalog WHERE source_truncated AND active;
  SELECT count(*) INTO v_zbyva_komentar
    FROM public.recipes_catalog
   WHERE instructions_cs::text ~ 'pravděpodobně chyba|pečte na 190';

  IF v_oznacenych <> 5 THEN
    RAISE EXCEPTION 'Oznacenych receptu je %, cekali jsme 5.', v_oznacenych;
  END IF;
  IF v_aktivnich_oznacenych <> 0 THEN
    RAISE EXCEPTION 'Oznacenych a zaroven aktivnich je %, cekali jsme 0.', v_aktivnich_oznacenych;
  END IF;
  IF v_zbyva_komentar <> 0 THEN
    RAISE EXCEPTION 'Vymysleny obsah zustal u % receptu, cekali jsme 0.', v_zbyva_komentar;
  END IF;
END $$;
