-- Jen animace. Statické fotky se z katalogu odstraňují.
--
-- DŮVOD (zpětná vazba od testera, 8. 9. 2026): hlavní cviky v plánu mají
-- animovanou kresbu z exercisedb, ale jakmile si uživatel přepnul na lehčí
-- variantu, dostal statickou fotku z posilovny — „najednou to nic nedělá".
-- Naměřeno: animaci má 23 z 211 použitelných cviků, a 56 párů variant
-- (13 lehčích, 43 těžších) mířilo z animace na fotku nebo naopak.
--
-- Řešení má dvě části:
--   1. Fotky z free-exercise-db se z katalogu odstraňují úplně. Cvik bez
--      animace zůstane bez obrázku — postup a obtížnost mu zůstávají.
--   2. Varianty smí mířit JEN na cvik, který animaci má. Jinak se nenabízí
--      vůbec: nabídnout přepnutí a pak ukázat nehybnou fotku je horší než
--      tlačítko neukázat.

-- ---------------------------------------------------------------------------
-- 1) Fotky pryč
-- ---------------------------------------------------------------------------
UPDATE public.exercise_asset_registry
SET image_url = NULL,
    wger_exercise_image_url = NULL
WHERE gif_url IS NULL;

-- U cviků s animací nemá statická fotka co dělat — animace je vždy lepší
-- a dvojí zdroj by se rozešel při první opravě.
UPDATE public.exercise_asset_registry
SET image_url = NULL,
    wger_exercise_image_url = NULL
WHERE gif_url IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Varianty jen mezi cviky s animací
-- ---------------------------------------------------------------------------
UPDATE public.exercise_asset_registry r
SET easier_key = NULL
WHERE r.easier_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.exercise_asset_registry e
    WHERE e.canonical_key = r.easier_key AND e.gif_url IS NOT NULL
  );

UPDATE public.exercise_asset_registry r
SET harder_key = NULL
WHERE r.harder_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.exercise_asset_registry h
    WHERE h.canonical_key = r.harder_key AND h.gif_url IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- 3) Kontroly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_s_fotkou integer;
  v_varianta_bez_animace integer;
  v_s_animaci integer;
BEGIN
  SELECT count(*) INTO v_s_fotkou FROM public.exercise_asset_registry
  WHERE image_url IS NOT NULL OR wger_exercise_image_url IS NOT NULL;
  IF v_s_fotkou > 0 THEN
    RAISE EXCEPTION '% cviků má pořád statickou fotku.', v_s_fotkou;
  END IF;

  SELECT count(*) INTO v_varianta_bez_animace
  FROM public.exercise_asset_registry r
  LEFT JOIN public.exercise_asset_registry e ON e.canonical_key = r.easier_key
  LEFT JOIN public.exercise_asset_registry h ON h.canonical_key = r.harder_key
  WHERE (r.easier_key IS NOT NULL AND e.gif_url IS NULL)
     OR (r.harder_key IS NOT NULL AND h.gif_url IS NULL);
  IF v_varianta_bez_animace > 0 THEN
    RAISE EXCEPTION '% variant míří na cvik bez animace.', v_varianta_bez_animace;
  END IF;

  SELECT count(*) INTO v_s_animaci FROM public.exercise_asset_registry WHERE gif_url IS NOT NULL;
  RAISE NOTICE 'Cviků s animací: %.', v_s_animaci;
END $$;
