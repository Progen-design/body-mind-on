-- Fronta objednávek na generované recepty + brána pro ruční schválení.
--
-- Katalog dnes stojí na Spoonacularu. Generátor ho doplňuje tam, kde import díry
-- nezaplní — typicky vegan sloty, kde je aktivních receptů v limitu 3 až 10,
-- zatímco na týdenní plán je potřeba 7 a u svačin 11 (3 sloty/den × 7 dní při
-- MAX_MEAL_USES_PER_WEEK = 2).
--
-- Tvrdá pravidla, která tahle migrace vynucuje:
--   - LLM nikdy nedodá kcal ani makra; nutrici počítá compute_recipe_nutrition
--   - recept čeká neaktivní s pending_review, dokud ho člověk nepustí
--   - aktivační brána se nemění, jen dostane jednu podmínku navíc

-- ---------------------------------------------------------------------------
-- 1. Fronta
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recipe_generation_queue (
  id              bigserial PRIMARY KEY,
  -- specifikace
  meal_type       text NOT NULL CHECK (meal_type IN ('snidane','obed','vecere','svacina')),
  diet_tags       text[] NOT NULL DEFAULT '{}',
  kcal_min        integer NOT NULL,
  kcal_max        integer NOT NULL,
  max_active_min  integer,
  pozadovano      integer NOT NULL CHECK (pozadovano > 0),
  vyrobeno        integer NOT NULL DEFAULT 0,
  -- řízení
  priorita        integer NOT NULL DEFAULT 100,
  zdroj           text NOT NULL CHECK (zdroj IN ('seed','demand')),
  stav            text NOT NULL DEFAULT 'pending'
                    CHECK (stav IN ('pending','running','done','failed','cancelled')),
  posledni_chyba  text,
  pokusu          integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (kcal_max > kcal_min)
);

-- Jedna OTEVŘENÁ položka na stejnou specifikaci.
--
-- Tohle je ta samá zábrana jako u weekly_plan_update a ze stejného důvodu:
-- signál 'demand' vzniká při každém selhaném skládání plánu, takže deset
-- uživatelů se stejnou dírou by bez indexu založilo deset stejných objednávek
-- a každý další den znovu. Kontrola v kódu nestačí — musí to spadnout v DB.
CREATE UNIQUE INDEX IF NOT EXISTS recipe_gen_queue_unikat
  ON public.recipe_generation_queue (meal_type, diet_tags, kcal_min, kcal_max)
  WHERE stav IN ('pending','running');

CREATE INDEX IF NOT EXISTS recipe_gen_queue_fronta
  ON public.recipe_generation_queue (priorita, created_at)
  WHERE stav = 'pending';

COMMENT ON TABLE public.recipe_generation_queue IS
  'Objednavky na generovane recepty. zdroj=seed rucni zadani, zdroj=demand diry ze skladani planu. Unikatni index brani duplicitnim otevrenym objednavkam.';
COMMENT ON COLUMN public.recipe_generation_queue.kcal_min IS
  'ZAKLADNI kcal receptu, ne cil slotu — porce se skaluji 0,5-2,0x.';

ALTER TABLE public.recipe_generation_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recipe_generation_queue FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.recipe_generation_queue_id_seq FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. pending_review
-- ---------------------------------------------------------------------------
ALTER TABLE public.recipes_catalog
  ADD COLUMN IF NOT EXISTS pending_review boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.recipes_catalog.pending_review IS
  'Ceka na rucni schvaleni. Trigger takovy recept nikdy neaktivuje — schvaleni je soucast brany, ne obchazka kolem ni.';

CREATE INDEX IF NOT EXISTS recipes_catalog_pending_review_idx
  ON public.recipes_catalog (created_at DESC)
  WHERE pending_review;

-- ---------------------------------------------------------------------------
-- 3. Aktivační brána: jedna podmínka navíc, zbytek beze změny
--
-- Podmínka je PRVNÍ v pořadí a je záměrně mimo ostatní kontroly: neschválený
-- recept se nemá posuzovat, má se jen nepustit. Sweeper běží nad stejným
-- pravidlem, takže ho nezaktivuje ani ten.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_recipe_catalog_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- 0) čeká na schválení člověkem
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

  -- b) Atwater podle MACRO_KCAL_GATE_TOLERANCE (10 %), high_fiber bránu obchází.
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

  -- e) ČAS — ZÁMĚRNĚ ZATÍM NEVYNUCOVÁN.
  --
  -- Zapne se po slotech, až denní import doplní katalog: nejdřív obed+vecere
  -- (deaktivovaly by ~21 %), snidane+svacina později (~34-36 %). Limity slotů
  -- jsou snidane 20, svacina 15, obed 30, vecere 30.
  --
  -- IF coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated) IS NULL
  --    OR coalesce(NEW.ready_in_minutes, NEW.prep_minutes_estimated) > CASE NEW.meal_type
  --         WHEN 'snidane' THEN 20 WHEN 'svacina' THEN 15 ELSE 30 END THEN
  --   NEW.active := false;
  --   RETURN NEW;
  -- END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_recipe_catalog_rules() IS
  'Jediny arbitr aktivace receptu. Kontroluje kazdy zapis, kde ma radek zustat aktivni. pending_review neaktivuje nikdy. Casova podminka je zamerne odlozena.';

-- ---------------------------------------------------------------------------
-- 4. Sweeper: stejné pravidlo, tedy taky nesmí pustit nedoschválené
-- ---------------------------------------------------------------------------
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
      AND NOT r.pending_review
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
      -- ČAS zatím nevynucován — shodně s triggerem, viz 20260801081000.
      -- Až se zapne, platí limity slotů snidane 20, svacina 15, obed 30, vecere 30.
    RETURNING r.id
  )
  SELECT count(*) INTO v_aktivovano FROM zmeneno;

  SELECT count(*) INTO v_aktivnich FROM public.recipes_catalog WHERE active;

  RETURN jsonb_build_object(
    'activated', v_aktivovano,
    'active_total', v_aktivnich,
    'swept_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_recipe_catalog_activation() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Kontrola: pending_review nesmí být aktivní a sweeper nesmí nic rozbít.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_spatnych integer;
BEGIN
  SELECT count(*) INTO v_spatnych
  FROM public.recipes_catalog WHERE active AND pending_review;

  IF v_spatnych <> 0 THEN
    RAISE EXCEPTION 'Aktivnich receptu cekajicich na schvaleni je %, cekali jsme 0.', v_spatnych;
  END IF;
END $$;
