-- Nálezy z vizuální kontroly všech 227 cviků s obrázkem (procházeno po
-- kontaktních listech v prohlížeči, ne dotazem do databáze — každá z těchto
-- vad má formálně platná data a najde se jen okem).
--
-- Pravidlo, které se tu drží: obrázek smí u cviku zůstat jen tehdy, když
-- ukazuje TENTÝŽ pohyb, jaký popisuje postup. Podobný cvik se nedosazuje —
-- radši žádný obrázek než cizí, protože právě záměna cviku za vizuálně
-- podobný je to, co uživatele splete nejvíc.

-- 1) cable_row „Přítahy na kladce" — kresba z exercisedb ukazuje tah SHORA
--    vsedě (pulldown), ne přítah k břichu. Katalog přítah vsedě na kladce
--    nemá, takže cvik zůstane bez obrázku.
UPDATE public.exercise_asset_registry SET gif_url = NULL WHERE canonical_key = 'cable_row';

-- 2) bicep_curl „Bicepsový zdvih" — kresba ukazuje zdvih v hlubokém
--    předklonu, postup mluví o stoji s lokty u boků. Kladivový zdvih ani
--    zdvih s velkou činkou se sem nedosazuje, je to jiný cvik.
UPDATE public.exercise_asset_registry SET gif_url = NULL WHERE canonical_key = 'bicep_curl';

-- 3) tricep_extension „Tricepsové tlaky" — kresba je extenze nad hlavou
--    vleže, postup popisuje stahování kladky vestoje.
UPDATE public.exercise_asset_registry SET gif_url = NULL WHERE canonical_key = 'tricep_extension';

-- 4) machine_bicep_curl — snímek přímo ve free-exercise-db ukazuje tlak nad
--    hlavu na stroji, ne bicepsový zdvih. Zdroj opravit nejde, snímek se
--    tedy odebírá.
UPDATE public.exercise_asset_registry SET image_url = NULL WHERE canonical_key = 'machine_bicep_curl';

--    Kvůli tomu se lehčí varianta bicepsového zdvihu překlápí na modlitebník
--    na kladce, který správný snímek má.
UPDATE public.exercise_asset_registry SET easier_key = 'cable_preacher_curl' WHERE canonical_key = 'bicep_curl';

-- 5) chest_press „Chest press" sdílel animaci s bench_press (bench press s
--    velkou činkou), přestože jde o tlak na stroji. Bere snímek od
--    leverage_chest_press, což je tentýž pohyb.
UPDATE public.exercise_asset_registry r
SET gif_url = NULL, image_url = z.image_url
FROM public.exercise_asset_registry z
WHERE r.canonical_key = 'chest_press'
  AND z.canonical_key = 'leverage_chest_press'
  AND z.image_url LIKE '%free-exercise-db%';

-- 6) lying_leg_curls se česky jmenoval „Bicepsový zdvih vleže" — chyba
--    překladu ("leg curl" -> "curl" -> "zdvih"). Jde o zakopávání vleže.
UPDATE public.exercise_asset_registry
SET display_name_cs = 'Zakopávání vleže na stroji'
WHERE canonical_key = 'lying_leg_curls';

-- ---------------------------------------------------------------------------
-- Kontroly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sdileny integer;
  v_chest text;
BEGIN
  SELECT count(*) INTO v_sdileny FROM (
    SELECT gif_url FROM public.exercise_asset_registry
    WHERE gif_url IS NOT NULL GROUP BY gif_url HAVING count(*) > 1
  ) x;
  IF v_sdileny > 0 THEN
    RAISE NOTICE 'Pozor: % animací pořád sdílí víc cviků.', v_sdileny;
  END IF;

  SELECT image_url INTO v_chest FROM public.exercise_asset_registry WHERE canonical_key = 'chest_press';
  IF v_chest IS NULL OR v_chest NOT LIKE '%Leverage_Chest_Press%' THEN
    RAISE EXCEPTION 'chest_press nedostal snímek tlaku na stroji (má %).', v_chest;
  END IF;
END $$;
