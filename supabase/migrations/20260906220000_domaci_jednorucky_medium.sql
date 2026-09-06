-- Dva cviky v aktivnich planech nemely cim ukazat provedeni.
--
-- Alert `cvik_v_planu_bez_media` hlasil dumbbell_romanian_deadlift a
-- dumbbell_row. Oba jsou v sablonach HOME_EQUIP_A/B, takze kdo cvici doma
-- s jednoruckami, dostal je do planu bez jedineho obrazku. Migrace
-- 20260830120000 tenhle dluh vedome zalozila a pocitala s tim, ze hlidka
-- bude stezovat, dokud import cviky nedozene. Nedohnal je.
--
-- RESENI BEZ ZTRATY PROGRESE. V registru uz lezely spravne jednoruckove
-- ekvivalenty s obrazkem:
--
--   dumbbell_row                 <- one_arm_dumbbell_row
--                                   (Pritahy s jednoruckami jednoruc)
--   dumbbell_romanian_deadlift   <- stiff_legged_dumbbell_deadlift
--                                   (Mrtvy tah s jednoruckami s napnutyma nohama)
--
-- Prekopirovat medium je lepsi nez prepsat sablony na ty existujici klice:
-- start_workout_progression je klicovana canonical_key, takze zmena klice
-- by lidem smazala historii zvedanych vah. Zobrazeny nazev zustava spravny,
-- meni se jen ukazka provedeni - a je to prakticky tentyz pohyb.
--
-- dumbbell_romanian_deadlift navic nemel equipment_class ani primary_muscle,
-- takze ho enforce_exercise_registry_rules() drzel na usable_in_plan = false
-- i po doplneni obrazku. Doplneno podle jednoruckoveho ekvivalentu.

update public.exercise_asset_registry t
set image_url       = z.image_url,
    body_part       = coalesce(t.body_part, z.body_part),
    target          = coalesce(t.target, z.target),
    external_source = coalesce(t.external_source, z.external_source),
    updated_at      = now()
from public.exercise_asset_registry z
where t.canonical_key = 'dumbbell_row'
  and z.canonical_key = 'one_arm_dumbbell_row'
  and t.image_url is null;

update public.exercise_asset_registry t
set image_url       = z.image_url,
    body_part       = coalesce(t.body_part, z.body_part),
    target          = coalesce(t.target, z.target),
    external_source = coalesce(t.external_source, z.external_source),
    updated_at      = now()
from public.exercise_asset_registry z
where t.canonical_key = 'dumbbell_romanian_deadlift'
  and z.canonical_key = 'stiff_legged_dumbbell_deadlift'
  and t.image_url is null;

update public.exercise_asset_registry
set equipment_class = 'dumbbell',
    primary_muscle  = 'hamstrings',
    equipment       = coalesce(equipment, 'dumbbell'),
    updated_at      = now()
where canonical_key = 'dumbbell_romanian_deadlift'
  and (equipment_class is null or primary_muscle is null);

-- Kontrola: oba klice musi mit medium a byt pouzitelne v planu.
DO $$
DECLARE v_spatne int;
BEGIN
  SELECT count(*) INTO v_spatne
  FROM public.exercise_asset_registry
  WHERE canonical_key IN ('dumbbell_row','dumbbell_romanian_deadlift')
    AND (coalesce(gif_url, image_url, '') = '' OR usable_in_plan IS NOT TRUE);

  IF v_spatne > 0 THEN
    RAISE EXCEPTION 'Domaci jednorucky: % z 2 cviku porad nema medium nebo neni usable_in_plan', v_spatne;
  END IF;
END $$;
