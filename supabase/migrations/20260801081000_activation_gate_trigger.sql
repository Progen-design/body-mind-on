-- Krok 2: trigger jako jediný arbitr aktivace.
--
-- Aktivačních cest je víc než jedna a to je jádro problému:
--   1. lib/spoonacular/catalogTranslate.js:192 — cron translate-recipes (co 5 minut)
--      nastavuje active = true po úspěšném překladu. ŽÁDNÁ nutriční ani jiná brána.
--      Takhle se aktivovalo 149 receptů se spoonacular_api nutricí.
--   2. scripts/seed-catalog-to-300.mjs — vyžaduje compute_recipe_nutrition().complete,
--      což u Spoonacular receptů neprojde prakticky nikdy.
--   3. jednorázové migrace.
--
-- Kontrola v jedné z cest je proto k ničemu. Trigger platí pro všechny zápisy bez
-- ohledu na to, kdo je udělal — `active = true` se z rozhodnutí stává žádostí a
-- arbitrem je tenhle kód. Translate cron se měnit nemusí.
--
-- Pravidlo je shodné s migrací 20260731150000, kterou se aktivovalo 107 receptů.

-- ---------------------------------------------------------------------------
-- 1. Jednorázový úklid: aktivní recept, který dnes padá na Atwaterovi
--
-- Trigger sice kontroluje každý zápis, ale sám o sobě se nespustí — bez zápisu do
-- řádku by ten recept zůstal aktivní neomezeně dlouho. Sundá se tedy hned tady.
-- ---------------------------------------------------------------------------
UPDATE public.recipes_catalog r
SET active = false
WHERE r.active
  AND NOT (
    'high_fiber' = ANY(r.diet_tags)
    OR (
      round(r.kcal) > 0
      AND round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g) > 0
      AND round(abs((round(r.kcal)::numeric - round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g)::numeric)
                    / round(r.kcal)::numeric) * 100, 1) <= 10.0
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Úplná brána
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_recipe_catalog_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Kontroluje se KAŽDÝ zápis, kde má řádek zůstat aktivní — ne jen přechod na
  -- active = true. Zachovává to původní chování a znamená to, že aktivní recept,
  -- který přestane pravidlům vyhovovat, spadne při nejbližším zápisu.
  --
  -- Bezpečné jen proto, že se ČAS zatím nevynucuje (viz bod e). Kdyby se zapnul
  -- dřív, než bude doplněný u většiny katalogu, sundal by při prvním zápisu
  -- prakticky všechno. Ověřeno na datech: nad 10 surovin 0 aktivních, bez name_cs
  -- 0, na Atwaterovi 1 — a ten se shodit má.
  IF NEW.active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- a) kcal a všechna tři makra vyplněná
  IF NEW.kcal IS NULL OR NEW.kcal <= 0
     OR NEW.protein_g IS NULL OR NEW.carbs_g IS NULL OR NEW.fat_g IS NULL THEN
    NEW.active := false;
    RETURN NEW;
  END IF;

  -- b) Atwater podle MACRO_KCAL_GATE_TOLERANCE (10 %), high_fiber bránu obchází.
  --    Doslovný přepis rowPassesMacroKcalGate z lib/macroKcalConsistency.js —
  --    zaokrouhlení na obou stranách i odchylka na 1 desetinné místo.
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
  -- ready_in_minutes má vyplněno 4 z 509 receptů, prep_minutes_estimated 154.
  -- Zapnout tuhle podmínku teď by znamenalo, že neprojde prakticky nic.
  -- Zpřísnit až po LLM odhadu a kalibraci (samostatný krok). Až na to dojde,
  -- odkomentovat; limity slotů jsou snidane 20, svacina 15, obed 30, vecere 30
  -- (zvednuto 1. 8. 2026, shodně s MEAL_SIMPLICITY_RULES v catalogImportGate.js).
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
  'Jediny arbitr aktivace receptu. Kontroluje kazdy zapis, kde ma radek zustat aktivni, bez ohledu na to, ktera cesta zapis udelala. Casova podminka je zamerne odlozena, dokud neni cas doplneny u vetsiny katalogu.';

-- ---------------------------------------------------------------------------
-- Kontrola: žádný aktivní recept neporušuje vynucovaná pravidla.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_spatnych integer;
BEGIN
  SELECT count(*) INTO v_spatnych
  FROM public.recipes_catalog r
  WHERE r.active AND (
    r.kcal IS NULL OR r.kcal <= 0 OR r.protein_g IS NULL OR r.carbs_g IS NULL OR r.fat_g IS NULL
    OR public.count_main_ingredients(r.ingredients) > 10
    OR r.name_cs IS NULL OR btrim(r.name_cs) = ''
    OR NOT ('high_fiber' = ANY(r.diet_tags) OR (
         round(r.kcal) > 0 AND round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g) > 0
         AND round(abs((round(r.kcal)::numeric - round(4*r.protein_g + 4*r.carbs_g + 9*r.fat_g)::numeric)
                       / round(r.kcal)::numeric) * 100, 1) <= 10.0))
  );

  IF v_spatnych <> 0 THEN
    RAISE EXCEPTION 'Aktivnich receptu porusujicich pravidla je %, cekali jsme 0.', v_spatnych;
  END IF;
END $$;
