-- 8.17 navazujici oprava: vlaknina u lusktenin a ryze byla na JINE BAZI
-- nez kalorie stejneho radku.
--
-- Odhalilo se to az potom, co migrace 20260906190000 zacala fiber_g
-- opravdu zapisovat do recipes_catalog - fazolove recepty vychazely na
-- 54 g vlakniny na porci.
--
-- CO BYLO SPATNE (vsechno zdroj 'reference_cs', ne z 20260906180000):
--
--   surovina  kcal/100g  baze podle kcal   fiber_g_per_100g  baze podle vlakniny
--   fazole    90         konzervovane      15.5              SUSENE
--   cocka     352        susena            10.7              VARENA
--   ryze      360        syrova            0.149             podhodnoceno
--
-- Mnozstvi v receptech potvrzuji, ze BAZE PODLE KCAL JE SPRAVNA:
-- ryze prum. 98 g (susena, 353 kcal), quinoa 75 g (susena), cocka 93 g
-- (susena), fazole 152 g (konzerva). Kalorie jsou tedy v poradku, chybna
-- byla jen vlaknina - proto se opravuje ONA, ne kcal.
--
-- Nove hodnoty (USDA FoodData Central, stejna baze jako kcal radku):
--   fazole  konzervovane / varene    6.4 g/100 g
--   cocka   susena                  30.5 g/100 g
--   ryze    syrova bila              1.3 g/100 g
--
-- POZOR pro budouci praci: 100 g SUSENE cocky je ~30 g vlakniny v jedne
-- porci, coz je cela denni doporucena davka. Recepty typu "Cocka s vejcem
-- - extra velka porce" (150 g cocky) vychazeji na 50 g. To uz NENI chyba
-- dat - je to otazka skladby receptu a patri do kurace katalogu, ne sem.

update public.ingredients_nutrition inu
set fiber_g_per_100g = v.fiber, updated_at = now()
from (values
  ('fazole', 6.4),
  ('cocka', 30.5),
  ('ryze', 1.3)
) as v(nazev, fiber)
where lower(extensions.unaccent(inu.name_cs)) = v.nazev;

-- Prepocet fiber_g u vsech aktivnich receptu. UPDATE bez zmeny hodnoty
-- staci - trigger enforce_recipe_catalog_rules (20260906190000) fiber_g
-- prepocita sam.
--
-- OVERENO PRED SPUSTENIM: zadny z 875 aktivnich receptu nepadne na zadnem
-- z osmi pravidel aktivacni brany, takze tenhle UPDATE nic nedeaktivuje.
update public.recipes_catalog set updated_at = updated_at where active = true;
