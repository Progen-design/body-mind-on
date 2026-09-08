-- "Tlaky s jednoručkami" (dumbbell_press) měly partii 'shoulders' podle
-- wger mapování ("Dumbbell Shoulder Press"), ale postup i obrázek popisují
-- tlak na lavici: "Lehni si na lavici… spouštěj činky k hrudníku". V kartě
-- cviku tak stálo "zabírá ramena" u cviku na hrudník. Varianty (lehčí Chest
-- press, těžší Bench press) taky mířily na hrudní cviky.
--
-- Sjednocuje se na hrudník podle toho, co cvik doopravdy popisuje.
UPDATE public.exercise_asset_registry
SET primary_muscle = 'chest',
    display_name_cs = 'Tlak na lavici s jednoručkami'
WHERE canonical_key = 'dumbbell_press';

DO $$
DECLARE v_partie text;
BEGIN
  SELECT primary_muscle INTO v_partie FROM public.exercise_asset_registry WHERE canonical_key = 'dumbbell_press';
  IF v_partie IS DISTINCT FROM 'chest' THEN
    RAISE EXCEPTION 'dumbbell_press nemá partii chest (má %).', v_partie;
  END IF;
END $$;
