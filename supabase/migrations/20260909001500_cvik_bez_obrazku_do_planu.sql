-- Cvik bez obrázku smí do plánu, pokud má český postup.
--
-- Migrace 20260908230000 odstranila statické fotky, aby se vedle animací
-- neobjevovaly dva různé vizuální styly. Vedlejší efekt: trigger
-- enforce_exercise_registry_rules() vyžadoval médium, takže katalog
-- plánovače spadl z 211 na 23 cviků. Doma s vlastní vahou zbylo 12 cviků
-- a v nabídce nezůstal jediný cvik na triceps ani na kvadricepsy.
--
-- Původní pravidlo znělo „cvik bez média je horší než žádný cvik". To ale
-- platilo v době, kdy cviky neměly český postup. Dnes ho má 218 z 230, a
-- očíslované kroky v panelu „Jak na to" uživateli řeknou, co má dělat,
-- i bez obrázku. Médium se proto mění z podmínky na bonus a jeho místo
-- zaujímá postup: co se dostane do plánu, musí jít popsat česky.

CREATE OR REPLACE FUNCTION public.enforce_exercise_registry_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.usable_in_plan := false;

  -- a) český postup. Nahrazuje dřívější podmínku na médium: cvik bez
  --    obrázku je použitelný, cvik bez návodu ne — u toho by uživatel
  --    nevěděl, co má dělat, a obrázek by mu to sám neřekl.
  IF NEW.instructions_cs IS NULL OR coalesce(array_length(NEW.instructions_cs, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- b) český název. Anglický název se uživateli nikdy neukáže.
  IF NEW.display_name_cs IS NULL OR btrim(NEW.display_name_cs) = '' THEN
    RETURN NEW;
  END IF;

  -- c) vybavení ze známého slovníku. Neznámé vybavení nelze porovnat s tím,
  --    co uživatel doma má, a cvik by se dostal do tréninku bez náčiní.
  IF NEW.equipment_class IS NULL OR NEW.equipment_class NOT IN
     ('body_weight','dumbbell','barbell','cable','machine','kettlebell','band') THEN
    RETURN NEW;
  END IF;

  -- d) partie. Bez ní nejde poptávku ani uspokojit, ani změřit.
  IF NEW.primary_muscle IS NULL OR btrim(NEW.primary_muscle) = '' THEN
    RETURN NEW;
  END IF;

  -- e) kanonický klíč ve tvaru, na který spoléhá plánovač.
  IF NEW.canonical_key !~ '^[a-z0-9_]{3,64}$' THEN
    RETURN NEW;
  END IF;

  NEW.usable_in_plan := true;
  RETURN NEW;
END;
$function$;

-- Trigger je BEFORE UPDATE, takže přepočet vynutí dotyk každého řádku.
UPDATE public.exercise_asset_registry SET updated_at = now();

-- ---------------------------------------------------------------------------
-- Kontroly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_pouzitelnych integer;
  v_bez_postupu integer;
  v_doma integer;
BEGIN
  SELECT count(*) INTO v_pouzitelnych
  FROM public.exercise_asset_registry WHERE usable_in_plan;
  IF v_pouzitelnych < 150 THEN
    RAISE EXCEPTION 'Katalog plánovače má jen % cviků, čekáno aspoň 150.', v_pouzitelnych;
  END IF;

  SELECT count(*) INTO v_bez_postupu
  FROM public.exercise_asset_registry
  WHERE usable_in_plan
    AND (instructions_cs IS NULL OR coalesce(array_length(instructions_cs, 1), 0) = 0);
  IF v_bez_postupu > 0 THEN
    RAISE EXCEPTION '% použitelných cviků nemá český postup.', v_bez_postupu;
  END IF;

  SELECT count(*) INTO v_doma
  FROM public.exercise_asset_registry
  WHERE usable_in_plan AND equipment_class = 'body_weight';
  RAISE NOTICE 'Použitelných cviků: %, z toho vlastní váha: %.', v_pouzitelnych, v_doma;
END $$;
