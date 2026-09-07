-- Cvik nese i postup provedení — docs/DALSI_KROK.md 9.9.
--
-- Rozhodnutí Honzy 7. 9. 2026: u cviku má být vedle obrázku i stručně,
-- jak se ten cvik provádí. Dnes `exercise_asset_registry` žádný textový
-- popis NEMÁ — jsou tam jen názvy, média, svalové partie a vybavení.
--
-- ZDROJ UŽ MÁME. 185 z 230 cviků pochází z `free-exercise-db`
-- (lib/exerciseImportRun.js, github.com/yuhonas/free-exercise-db,
-- licence Unlicense = volné dílo) a ten dataset má u každého cviku pole
-- `instructions` — jenom se při importu zahazovalo, protože nebylo kam
-- ho uložit. Zbylých 32 z `exercisedb` a 13 bez zdroje instrukce nemají
-- a zůstanou bez postupu; NULL je poctivější než vymyšlený text.
--
-- DVA SLOUPCE, NE JEDEN. Přesně stejný vzor, jaký už má katalog receptů
-- (`recipes_catalog.instructions_cs`): syrový anglický zdroj zvlášť,
-- český překlad zvlášť.
--   - `instructions_en` je otisk zdroje. Když se překlad pokazí nebo se
--     změní model, dá se přeložit znovu bez dalšího stahování.
--   - `instructions_cs` je JEDINÉ, co jde do UI. Anglický text se
--     uživateli nikdy neukáže — radši žádný postup než anglický.
--
-- Pole (`text[]`), ne jeden `text`: kroky jsou očíslované a UI je vypisuje
-- jako seznam. Slepit je do jednoho řetězce by znamenalo je v UI zase
-- rozsekávat podle teček, což u zkratek jako „approx." selže.

ALTER TABLE public.exercise_asset_registry
  ADD COLUMN IF NOT EXISTS instructions_en text[],
  ADD COLUMN IF NOT EXISTS instructions_cs text[];

COMMENT ON COLUMN public.exercise_asset_registry.instructions_en IS
  'Kroky provedeni v anglictine, jak je vraci free-exercise-db (pole instructions). Syrovy zdroj, do UI NEJDE.';
COMMENT ON COLUMN public.exercise_asset_registry.instructions_cs IS
  'Kroky provedeni cesky, prelozene z instructions_en. Jedine, co se ukazuje uzivateli. Stejny vzor jako recipes_catalog.instructions_cs (docs/DALSI_KROK.md 9.9).';

-- ===========================================================================
-- Kontroly
-- ===========================================================================
DO $$
DECLARE
  v_sloupcu integer;
  v_cviku   integer;
  v_fedb    integer;
BEGIN
  SELECT count(*) INTO v_sloupcu FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'exercise_asset_registry'
    AND column_name IN ('instructions_en', 'instructions_cs');
  IF v_sloupcu <> 2 THEN
    RAISE EXCEPTION 'sloupce instructions_en/instructions_cs nevznikly (nalezeno %)', v_sloupcu;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE external_source = 'free-exercise-db')
    INTO v_cviku, v_fedb
  FROM public.exercise_asset_registry;

  RAISE NOTICE 'exercise_asset_registry: % cviku, z toho % z free-exercise-db (ty maji ve zdroji instructions).', v_cviku, v_fedb;
END $$;
