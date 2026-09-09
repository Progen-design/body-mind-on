-- Dva různé cviky nesmí mít v katalogu stejný český název.
--
-- NAMĚŘENO 9. 9. 2026: 17 použitelných cviků sdílelo 8 názvů. „Přemístění"
-- označovalo tři různé cviky, „Kliky" i obyčejný klik i klik s přechodem
-- do bočního prkna. V tréninku to vypadá jako chyba aplikace — a když
-- lehčí varianta nese stejný název jako cvik, ze kterého se přepíná,
-- uživatel po kliknutí nepozná, jestli se vůbec něco stalo.
--
-- Názvy vznikly strojovým překladem anglických názvů ze zdroje, kde se
-- rozlišení schovává v přívlastku („Full Squat" vs „Squat", „Medium",
-- „Low"). Překlad ten přívlastek zahodil.

-- Dřepy: „Full Squat" jde pod paralelu, běžný dřep ne.
UPDATE public.exercise_asset_registry
SET display_name_cs = 'Hluboký dřep s velkou činkou'
WHERE canonical_key = 'barbell_full_squat';

-- Klik s rotací do bočního prkna není obyčejný klik.
UPDATE public.exercise_asset_registry
SET display_name_cs = 'Klik s přechodem do bočního prkna'
WHERE canonical_key = 'push_up_to_side_plank';

UPDATE public.exercise_asset_registry
SET display_name_cs = 'Kliky na šikmé lavici středním úchopem'
WHERE canonical_key = 'incline_push_up_medium';

-- Přemístění: tři různé cviky, tři názvy podle toho, kde se činka chytá.
UPDATE public.exercise_asset_registry
SET display_name_cs = 'Přemístění do dřepu'
WHERE canonical_key = 'clean';

UPDATE public.exercise_asset_registry
SET display_name_cs = 'Přemístění do stoje'
WHERE canonical_key = 'power_clean';

UPDATE public.exercise_asset_registry
SET display_name_cs = 'Mrtvý tah do přemístění'
WHERE canonical_key = 'clean_deadlift';

-- Kladky: rozhoduje výška, ze které se táhne.
UPDATE public.exercise_asset_registry
SET display_name_cs = 'Stahování horních kladek'
WHERE canonical_key = 'cable_crossover';

UPDATE public.exercise_asset_registry
SET display_name_cs = 'Stahování spodních kladek'
WHERE canonical_key = 'low_cable_crossover';

-- `dumbbell_press` má ve zdroji název „dumbbell shoulder press", ale jeho
-- animace i postup popisují tlak vleže — proto má ručně opravenou partii
-- `chest` (viz migrace 20260909020000). Aby se nepletl s
-- `dumbbell_bench_press`, dostává název podle lavice.
UPDATE public.exercise_asset_registry
SET display_name_cs = 'Tlak s jednoručkami na rovné lavici'
WHERE canonical_key = 'dumbbell_press';

UPDATE public.exercise_asset_registry
SET display_name_cs = 'Tlak nad hlavu na pákovém stroji'
WHERE canonical_key = 'leverage_shoulder_press';

UPDATE public.exercise_asset_registry
SET display_name_cs = 'Výpony na leg pressu'
WHERE canonical_key = 'calf_press_on_the_leg_press_machine';

-- ---------------------------------------------------------------------------
-- Kontroly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_duplicit integer;
  v_ukazka text;
  v_varianta_stejne integer;
BEGIN
  SELECT count(*), min(display_name_cs) INTO v_duplicit, v_ukazka
  FROM (
    SELECT display_name_cs
    FROM public.exercise_asset_registry
    WHERE usable_in_plan
    GROUP BY display_name_cs
    HAVING count(*) > 1
  ) d;
  IF v_duplicit > 0 THEN
    RAISE EXCEPTION '% názvů má víc než jeden cvik, např. „%".', v_duplicit, v_ukazka;
  END IF;

  -- Varianta se stejným názvem je horší než žádná: tlačítko slíbí změnu,
  -- ale karta po přepnutí vypadá identicky.
  SELECT count(*) INTO v_varianta_stejne
  FROM public.exercise_asset_registry r
  LEFT JOIN public.exercise_asset_registry e ON e.canonical_key = r.easier_key
  LEFT JOIN public.exercise_asset_registry h ON h.canonical_key = r.harder_key
  WHERE r.display_name_cs IN (e.display_name_cs, h.display_name_cs);
  IF v_varianta_stejne > 0 THEN
    RAISE EXCEPTION '% cviků nabízí variantu se stejným názvem.', v_varianta_stejne;
  END IF;

  RAISE NOTICE 'Názvy jsou jednoznačné.';
END $$;
