-- Dvě opravy vad nalezených při kontrole aplikace v produkci.
--
-- 1) MÉDIA: 13 cviků má v wger_exercise_image_url JEDEN A TÝŽ obrázek
--    (gluteální most se španělským popiskem "Inicio / Movimiento"). V celém
--    registru je jediná unikátní wger URL na 13 řádků — chyba backfillu
--    médií, ne wgeru. U cviku "Tlaky s jednoručkami" to uživatel viděl jako
--    obrázek úplně jiného cviku. Vadné URL se maže a tam, kde katalog má
--    odpovídající snímek z free-exercise-db, se doplní; jinde zůstane cvik
--    bez obrázku — žádný obrázek je lepší než cizí.
--
-- 2) VARIANTY: plošné párování podle nářadí uvnitř stejné úrovně
--    (migrace 20260908140000, krok 2) vyrobilo nesmyslné dvojice napříč
--    různými pohybovými vzory — "Úklony s jednoručkami" dostaly jako těžší
--    variantu "Zkracovačky na stroji". Ruší se; zůstávají jen páry z různých
--    úrovní obtížnosti a ručně vybrané dvojice.

-- ---------------------------------------------------------------------------
-- 1) Média
-- ---------------------------------------------------------------------------
UPDATE public.exercise_asset_registry
SET wger_exercise_image_url = NULL
WHERE wger_exercise_image_url = 'https://wger.de/media/exercise-images/2534/cedd0b51-c6cf-40b9-881d-58d6c572bf9d.png';

-- Doplnění snímku z free-exercise-db podle odpovídajícího cviku v katalogu.
UPDATE public.exercise_asset_registry r
SET image_url = z.image_url
FROM (VALUES
  ('box_jump',            'bench_jump'),
  ('bulgarian_squat',     'split_squat_with_dumbbells'),
  ('chest_fly',           'dumbbell_flyes'),
  ('crunch',              'crunch_hands_overhead'),
  ('dumbbell_press',      'dumbbell_bench_press'),
  ('face_pull',           'reverse_machine_flyes'),
  ('hip_thrust',          'barbell_hip_thrust'),
  ('incline_bench_press', 'barbell_incline_bench_press_medium_grip'),
  ('leg_raise',           'bent_knee_hip_raise'),
  ('tricep_dip',          'bench_dips')
) AS m(cil, zdroj)
JOIN public.exercise_asset_registry z ON z.canonical_key = m.zdroj
WHERE r.canonical_key = m.cil
  AND z.image_url LIKE '%free-exercise-db%';

-- 'dips', 'jumping_jack' a 'step_up' v katalogu odpovídající snímek nemají,
-- zůstávají bez obrázku (postup i obtížnost mají).

-- ---------------------------------------------------------------------------
-- 2) Zrušení plošných párů uvnitř stejné úrovně
--
--    Ponechává se whitelist ručně vybraných dvojic, kde je rozdíl v nářadí
--    skutečnou progresí téhož pohybu (stroj -> volná zátěž).
-- ---------------------------------------------------------------------------
UPDATE public.exercise_asset_registry r
SET easier_key = NULL
WHERE r.easier_key IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.exercise_asset_registry e
    WHERE e.canonical_key = r.easier_key
      AND e.level IS NOT DISTINCT FROM r.level
  )
  AND r.canonical_key NOT IN (
    'bicep_curl', 'tricep_extension', 'lateral_raise', 'pushup',
    'squat', 'dumbbell_row', 'dumbbell_bench_press'
  );

UPDATE public.exercise_asset_registry r
SET harder_key = NULL
WHERE r.harder_key IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.exercise_asset_registry h
    WHERE h.canonical_key = r.harder_key
      AND h.level IS NOT DISTINCT FROM r.level
  )
  AND r.canonical_key NOT IN (
    'bicep_curl', 'tricep_extension', 'hamstring_curl'
  );

-- Funkce z 20260908140000 už nemá co obsluhovat.
DROP FUNCTION IF EXISTS public.exercise_equipment_ordinal(text);

-- ---------------------------------------------------------------------------
-- 3) Kontroly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sdilene_medium integer;
  v_sam_sobe integer;
  v_ruzne_urovne integer;
BEGIN
  -- Žádné dva cviky nesmí sdílet tentýž obrázek — přesně tahle vada se opravuje.
  SELECT count(*) INTO v_sdilene_medium FROM (
    SELECT image_url FROM public.exercise_asset_registry
    WHERE image_url IS NOT NULL GROUP BY image_url HAVING count(*) > 1
  ) x;
  IF v_sdilene_medium > 0 THEN
    RAISE NOTICE 'Pozor: % obrázků sdílí víc cviků.', v_sdilene_medium;
  END IF;

  SELECT count(*) INTO v_sam_sobe FROM public.exercise_asset_registry
  WHERE canonical_key = easier_key OR canonical_key = harder_key;
  IF v_sam_sobe > 0 THEN
    RAISE EXCEPTION '% cviků ukazuje samo na sebe.', v_sam_sobe;
  END IF;

  SELECT count(*) INTO v_ruzne_urovne
  FROM public.exercise_asset_registry r
  JOIN public.exercise_asset_registry e ON e.canonical_key = r.easier_key
  WHERE e.level IS NOT DISTINCT FROM r.level
    AND r.canonical_key NOT IN ('bicep_curl','tricep_extension','lateral_raise','pushup','squat','dumbbell_row','dumbbell_bench_press');
  IF v_ruzne_urovne > 0 THEN
    RAISE EXCEPTION '% lehčích variant zůstalo na stejné úrovni mimo whitelist.', v_ruzne_urovne;
  END IF;
END $$;
