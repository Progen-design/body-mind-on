-- Sjednocení diet_tags na podtržítkový formát.
--
-- Spoonacular vrací mezerový zápis ("gluten free"), náš filtr
-- catalogRowMatchesDiet porovnává přesnou shodou a očekává podtržítka.
-- Katalog proto obsahuje dvě oddělené populace tagů a filtr polovinu
-- receptů nevidí. Mapovací tabulka odpovídá lib/dietTags.js — když se mění
-- jedna, musí se změnit i druhá.
--
-- POZOR na trigger trg_enforce_recipe_catalog_rules: je BEFORE UPDATE a
-- shodí active u receptu, který má víc než 6 hlavních surovin. V katalogu
-- je dnes právě jeden takový aktivní recept, id 627 „Čočkový salát s mangem"
-- (7 hlavních surovin), a ten normalizaci potřebuje. Tato migrace ho tedy
-- deaktivuje — trigger dělá, co má. Kontrolní blok na konci ověří, že
-- nešlo o víc receptů, než kolik jsme čekali.

-- Aktualizujeme jen řádky, kde se pole opravdu mění — ať trigger nespouštíme
-- zbytečně nad celým katalogem.
WITH normalized AS (
  SELECT
    r.id,
    ARRAY(
      SELECT DISTINCT CASE lower(trim(t))
        WHEN 'gluten free'          THEN 'gluten_free'
        WHEN 'lacto ovo vegetarian' THEN 'vegetarian'
        WHEN 'dairy free'           THEN 'dairy_free'
        WHEN 'fodmap friendly'      THEN 'low_fodmap'
        WHEN 'whole 30'             THEN 'whole30'
        WHEN 'low carb'             THEN 'low_carb'
        ELSE lower(trim(t))
      END
      FROM unnest(COALESCE(r.diet_tags, '{}'::text[])) AS t
      ORDER BY 1
    ) AS nove_tagy
  FROM public.recipes_catalog r
)
UPDATE public.recipes_catalog r
SET diet_tags = n.nove_tagy
FROM normalized n
WHERE n.id = r.id
  AND n.nove_tagy IS DISTINCT FROM COALESCE(r.diet_tags, '{}'::text[]);

-- Kontrola: po normalizaci nesmí zůstat žádný tag s mezerou.
DO $$
DECLARE
  zbyva integer;
BEGIN
  SELECT count(*) INTO zbyva
  FROM public.recipes_catalog r, unnest(COALESCE(r.diet_tags, '{}'::text[])) AS t
  WHERE t LIKE '% %';

  IF zbyva > 0 THEN
    RAISE EXCEPTION 'Po normalizaci zbyva % tagu s mezerou — doplnit mapovaci tabulku', zbyva;
  END IF;
END
$$;

-- Kontrola: trigger smel deaktivovat nejvyse ten jeden znamy recept.
DO $$
DECLARE
  aktivnich integer;
BEGIN
  SELECT count(*) INTO aktivnich FROM public.recipes_catalog WHERE active IS TRUE;

  IF aktivnich < 297 THEN
    RAISE EXCEPTION
      'Aktivnich receptu je % (cekali jsme 297 = 298 minus id 627). Trigger deaktivoval vic, nez mel.',
      aktivnich;
  END IF;
END
$$;
