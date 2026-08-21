-- Objednávka receptů pro sloty, které měřením vyšly jako nejtenčí.
--
-- Poptávková smyčka se od teď plní sama (viz oprava chybějícího await ve
-- fetchCatalogCandidates), ale ta se projeví až při dalším skládání plánů.
-- Tohle je startovací dávka, aby denní cron ve 3:15 měl hned co dělat.
--
-- Čísla z produkčního logu, jeden plán:
--   snídaně  128 kandidátů dovnitř, 19–21 ven
--   svačina   42 dovnitř, 20–22 ven; po čtyřech svačinách zásoba na týden pryč
--   večeře    83 dovnitř, 50 ven
--   oběd     128 dovnitř, ~100 ven  (nejmenší problém, proto nejmenší dávka)
--
-- Pásma odpovídají tomu, co skladač reálně žádá u profilu s cílem 2 164 kcal.
-- Diety prázdné schválně: vegan fronta má vlastní položky s vyšší prioritou.

INSERT INTO public.recipe_generation_queue
  (meal_type, diet_tags, kcal_min, kcal_max, max_active_min, pozadovano, priorita, zdroj, stav)
VALUES
  ('snidane', '{}', 300, 550, 20, 12, 20, 'seed', 'pending'),
  ('svacina', '{}', 150, 320, 15, 10, 20, 'seed', 'pending'),
  ('vecere',  '{}', 450, 700, 30,  8, 20, 'seed', 'pending'),
  ('obed',    '{}', 450, 700, 30,  6, 20, 'seed', 'pending')
ON CONFLICT DO NOTHING;
