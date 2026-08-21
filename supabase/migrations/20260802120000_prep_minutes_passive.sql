-- Pasivní čekání vedle aktivního času.
--
-- prep_minutes_estimated drží AKTIVNÍ čas — to, co uživatele stojí pozornost a
-- podle čeho se rozhoduje, jestli se jídlo vejde do slotu. Namáčení fazolí přes
-- noc do téhle hodnoty nepatří, ale zahodit ho taky nechceme: uživateli je
-- potřeba říct „15 minut práce, ale fazole musíš namočit den předem“, jinak
-- v šest večer zjistí, že večeři uvařit nestihne.
--
-- Proč vlastní sloupec a ne součet: součet odpovídá na otázku „kdy bude hotovo“,
-- ale slot se plánuje podle otázky „kolik času tomu musím věnovat“. To jsou dvě
-- různá čísla a slévat je do jednoho byla přesně ta chyba, kterou tahle migrace
-- napravuje — model do jediného `minutes` počítal i osmihodinové namáčení a
-- hummus pak vypadal jako 90minutová práce.

ALTER TABLE public.recipes_catalog
  ADD COLUMN IF NOT EXISTS prep_minutes_passive integer;

ALTER TABLE public.recipes_catalog
  DROP CONSTRAINT IF EXISTS recipes_catalog_prep_passive_chk;
ALTER TABLE public.recipes_catalog
  ADD CONSTRAINT recipes_catalog_prep_passive_chk
    CHECK (prep_minutes_passive IS NULL OR prep_minutes_passive >= 0);

COMMENT ON COLUMN public.recipes_catalog.prep_minutes_passive IS
  'Pasivni cekani v minutach (namaceni, chlazeni, kynuti, kliceni, mrazeni). Do prep_minutes_estimated se NEPOCITA. NULL = nezmereno, 0 = zadne cekani.';

COMMENT ON COLUMN public.recipes_catalog.prep_minutes_estimated IS
  'AKTIVNI cas pripravy v minutach — cas, kdy uzivatel musi byt u jidla. Pasivni cekani ma vlastni sloupec prep_minutes_passive. U source=structured_length je to soucet uvedenych delek kroku, tedy spodni mez.';
