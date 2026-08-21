-- Slovnik surovin: 24 zakladnich ceskych nazvu, ktere v nem chybely.
--
-- PROC. Vetev `nenormalizovana_surovina` hlasila 30 surovin z aktivnich planu.
-- Overeno 21. 8. 2026, ze z nich:
--   6  uz ve slovniku JSOU (egg whites, chili powder, scallions, old fashioned
--      oats, salt, agavovy sirup) — jsou to zbytky v logu
--      `ingredient_normalization_misses` z doby pred doplnenim aliasu.
--      Vetev cte log za poslednich 7 dni, takze vypadnou samy.
--  24  chybely doopravdy — a az na jednu jsou to bezne ceske suroviny:
--      ananas, boruvky, cizrna, cukr, krevety, petrzel, rukola, voda…
--
-- Bez kanonickeho nazvu je nakupni seznam neumi secist ani nahradit: kdo ma
-- v tydnu tri recepty s petrzeli, dostane tri samostatne radky misto jednoho.
--
-- VETSINA MAPUJE SAMA NA SEBE. Nejsou to synonyma, jen zaznam, ze surovinu
-- znameme — `alias_normalized` = `canonical_normalized`. Vyjimky jsou tri
-- a jsou okomentovane u nich.
--
-- `alias_normalized` a `canonical_normalized` jsou bez diakritiky a male,
-- `display_alias_cs` je podoba pro uzivatele. Drzi se tim konvence, kterou
-- zavedla migrace 20260721223051.

insert into public.ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs)
select v.alias, v.canonical, v.zobrazit
from (values
  -- Ovoce
  ('ananas',                 'ananas',            'ananas'),
  ('boruvky',                'boruvky',           'borůvky'),
  ('broskev',                'broskev',           'broskev'),
  ('maliny',                 'maliny',            'maliny'),
  ('tresne',                 'tresne',            'třešně'),
  -- Zelenina a lusteniny
  ('cizrna',                 'cizrna',            'cizrna'),
  ('rukola',                 'rukola',            'rukola'),
  ('petrzel',                'petrzel',           'petržel'),
  ('koriandr',               'koriandr',          'koriandr'),
  -- „collard“ je anglicky nazev odrudy; kanonicky je to listova kapusta,
  -- aby se secetla s ostatnimi zaznamy kapusty na nakupnim seznamu.
  ('listova kapusta collard','listova kapusta',   'listová kapusta'),
  -- Bilkoviny
  ('krevety',                'krevety',           'krevety'),
  -- Semena a orechy
  ('chia seminka',           'chia seminka',      'chia semínka'),
  ('lnena seminka',          'lnena seminka',     'lněná semínka'),
  ('slunecnicova seminka',   'slunecnicova seminka', 'slunečnicová semínka'),
  -- Pecivo a prilohy
  ('celozrnna pita',         'pita',              'celozrnná pita'),
  -- Ochucovadla a suroviny do peceni
  ('cukr',                   'cukr',              'cukr'),
  ('kakaovy prasek',         'kakaovy prasek',    'kakaový prášek'),
  ('vanilkovy extrakt',      'vanilkovy extrakt', 'vanilkový extrakt'),
  ('safran',                 'safran',            'šafrán'),
  ('tahini',                 'tahini',            'tahini'),
  ('hummus',                 'hummus',            'hummus'),
  ('bile vino',              'bile vino',         'bílé víno'),
  ('voda',                   'voda',              'voda'),
  -- Posledni anglicky zbytek z importu. Kanonicky cedar, aby se secetl
  -- s ostatnimi zaznamy syra.
  ('reduced fat cheddar cheese','cedar',          'light čedar')
) as v(alias, canonical, zobrazit)
where not exists (
  select 1 from public.ingredient_aliases a
  where lower(btrim(a.alias_normalized)) = v.alias
);
